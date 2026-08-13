import { accessBlueprint } from "./blueprint.mjs";
import {
  DirectusAdminClient,
  isMainModule,
} from "../schema/apply-schema.mjs";

export function buildPermissionPayload(policyId, permission) {
  const payload = {
    policy: policyId,
    collection: permission.collection,
    action: permission.action,
    fields: permission.fields ?? ["*"],
  };
  if (permission.permissions) payload.permissions = permission.permissions;
  if (permission.validation) payload.validation = permission.validation;
  if (permission.presets) payload.presets = permission.presets;
  return payload;
}

const normalize = (value) => {
  if (Array.isArray(value)) return value.map(normalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, normalize(nested)]),
  );
};

export function permissionMatches(existing, desired) {
  const comparable = (permission) => ({
    policy: permission.policy,
    collection: permission.collection,
    action: permission.action,
    permissions: permission.permissions ?? null,
    validation: permission.validation ?? null,
    presets: permission.presets ?? null,
    fields: permission.fields ?? ["*"],
  });

  return (
    JSON.stringify(normalize(comparable(existing))) ===
    JSON.stringify(normalize(comparable(desired)))
  );
}

const permissionKey = (policyId, collection, action) =>
  `${policyId}:${collection}:${action}`;

export async function applyAccessBlueprint(
  client,
  blueprint,
  { dryRun = false } = {},
) {
  const actions = [];

  for (const folder of [
    blueprint.publicAssetFolder,
    blueprint.leadAttachmentFolder,
  ]) {
    const folderQuery = new URLSearchParams({
      "filter[id][_eq]": folder.id,
      limit: "1",
      fields: "id",
    });
    const folders = await client.request(`/folders?${folderQuery.toString()}`);
    if (folders.length === 0) {
      actions.push(`create folder ${folder.name}`);
      if (!dryRun) {
        await client.request("/folders", {
          method: "POST",
          body: JSON.stringify(folder),
        });
      }
    }
  }

  const roles = await client.request("/roles?limit=-1");
  const policies = await client.request("/policies?limit=-1");
  const accessRows = await client.request("/access?limit=-1");
  const permissions = await client.request(
    "/permissions?limit=-1&fields=id,policy,collection,action,permissions,validation,presets,fields",
  );

  const roleByName = new Map(roles.map((role) => [role.name, role]));
  const policyByName = new Map(
    policies.map((policy) => [policy.name, policy]),
  );
  const managedPolicyIds = new Set();
  const desiredPermissionKeys = new Set();

  for (const policyDefinition of blueprint.policies) {
    const policyName =
      policyDefinition.existingPolicyName ?? policyDefinition.policyName;
    const desiredPolicyName = policyDefinition.policyName ?? policyName;
    let policy = policyByName.get(policyName) ?? policyByName.get(desiredPolicyName);
    if (!policy) {
      for (const legacyName of policyDefinition.existingPolicyNames ?? []) {
        policy = policyByName.get(legacyName);
        if (policy) break;
      }
    }
    if (!policy) {
      actions.push(`create policy ${desiredPolicyName}`);
      if (!dryRun) {
        policy = await client.request("/policies", {
          method: "POST",
          body: JSON.stringify({
            name: desiredPolicyName,
            icon: policyDefinition.role?.icon ?? "public",
            description:
              policyDefinition.role?.description ?? "Public website access.",
            app_access: policyDefinition.appAccess,
            admin_access: policyDefinition.adminAccess,
          }),
        });
      } else {
        policy = { id: `dry-run:${policyDefinition.key}`, name: desiredPolicyName };
      }
      policyByName.set(desiredPolicyName, policy);
    } else if (
      policyDefinition.policyName &&
      policy.name !== policyDefinition.policyName
    ) {
      actions.push(`rename policy ${policy.name} -> ${policyDefinition.policyName}`);
      if (!dryRun) {
        await client.request(`/policies/${policy.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: policyDefinition.policyName,
            icon: policyDefinition.role?.icon ?? "public",
            description: policyDefinition.role?.description ?? null,
          }),
        });
      }
      policy = { ...policy, name: policyDefinition.policyName };
      policyByName.set(policy.name, policy);
    }
    managedPolicyIds.add(policy.id);

    if (policyDefinition.role) {
      let role = roleByName.get(policyDefinition.role.name);
      if (!role) {
        for (const legacyName of policyDefinition.role.existingNames ?? []) {
          role = roleByName.get(legacyName);
          if (role) break;
        }
      }
      if (!role) {
        actions.push(`create role ${policyDefinition.role.name}`);
        if (!dryRun) {
          const { existingNames: _existingNames, ...rolePayload } = policyDefinition.role;
          role = await client.request("/roles", {
            method: "POST",
            body: JSON.stringify(rolePayload),
          });
        } else {
          role = {
            id: `dry-run:${policyDefinition.key}:role`,
            name: policyDefinition.role.name,
          };
        }
        roleByName.set(role.name, role);
      } else if (role.name !== policyDefinition.role.name) {
        actions.push(`rename role ${role.name} -> ${policyDefinition.role.name}`);
        if (!dryRun) {
          const { existingNames: _existingNames, ...rolePayload } = policyDefinition.role;
          await client.request(`/roles/${role.id}`, {
            method: "PATCH",
            body: JSON.stringify(rolePayload),
          });
        }
        role = { ...role, ...policyDefinition.role };
        roleByName.set(role.name, role);
      }

      const hasAccess = accessRows.some(
        (row) => row.role === role.id && row.policy === policy.id,
      );
      if (!hasAccess) {
        actions.push(`attach ${desiredPolicyName} policy to ${role.name}`);
        if (!dryRun) {
          await client.request("/access", {
            method: "POST",
            body: JSON.stringify({ role: role.id, policy: policy.id }),
          });
        }
      }
    }

    for (const definition of policyDefinition.permissions) {
      const desired = buildPermissionPayload(policy.id, definition);
      const key = permissionKey(
        policy.id,
        definition.collection,
        definition.action,
      );
      desiredPermissionKeys.add(key);
      const existing = permissions.find(
        (item) =>
          item.policy === policy.id &&
          item.collection === definition.collection &&
          item.action === definition.action,
      );

      if (!existing) {
        actions.push(
          `create ${desiredPolicyName} permission ${definition.collection}:${definition.action}`,
        );
        if (!dryRun) {
          try {
            await client.request("/permissions", {
              method: "POST",
              body: JSON.stringify(desired),
            });
          } catch (error) {
            if (error.message.includes("RESOURCE_RESTRICTED")) {
              const fallback = { ...desired };
              delete fallback.permissions;
              delete fallback.validation;
              delete fallback.presets;
              await client.request("/permissions", {
                method: "POST",
                body: JSON.stringify(fallback),
              });
              actions.push(
                `note: created without custom rules ${desiredPolicyName} permission ${definition.collection}:${definition.action}`,
              );
            } else {
              throw error;
            }
          }
        }
      } else if (!permissionMatches(existing, desired)) {
        actions.push(
          `update ${desiredPolicyName} permission ${definition.collection}:${definition.action}`,
        );
        if (!dryRun) {
          try {
            await client.request(`/permissions/${existing.id}`, {
              method: "PATCH",
              body: JSON.stringify(desired),
            });
          } catch (error) {
            if (error.message.includes("RESOURCE_RESTRICTED")) {
              actions.push(
                `skip restricted ${desiredPolicyName} permission ${definition.collection}:${definition.action}`,
              );
            } else {
              throw error;
            }
          }
        }
      }
    }
  }

  for (const permission of permissions) {
    if (!managedPolicyIds.has(permission.policy)) continue;
    const key = permissionKey(
      permission.policy,
      permission.collection,
      permission.action,
    );
    if (desiredPermissionKeys.has(key)) continue;

    actions.push(
      `remove stale permission ${permission.collection}:${permission.action}`,
    );
    if (!dryRun) {
      await client.request(`/permissions/${permission.id}`, {
        method: "DELETE",
      });
    }
  }

  return actions;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const client = await DirectusAdminClient.connectFromEnvironment();
  const actions = await applyAccessBlueprint(client, accessBlueprint, {
    dryRun,
  });

  if (actions.length === 0) {
    console.log("Access configuration is already up to date.");
    return;
  }

  console.log(`${dryRun ? "Planned" : "Applied"} ${actions.length} actions:`);
  for (const action of actions) console.log(`- ${action}`);
}

if (isMainModule(import.meta.url, process.argv[1])) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
