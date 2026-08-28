import { randomBytes } from "node:crypto";

import { DirectusAdminClient } from "./schema/apply-schema.mjs";

async function main() {
  const client = await DirectusAdminClient.connectFromEnvironment();

  // Find the Frontend API role
  const roles = await client.request("/roles?limit=-1");
  const frontendRole = roles.find((r) => r.name === "Frontend API");

  if (!frontendRole) {
    console.error("Frontend API role not found. Run apply-access.mjs first.");
    process.exit(1);
  }

  console.log("Found Frontend API role:", frontendRole.id);

  // Create a static token user for the Frontend API role
  const token = randomBytes(32).toString("hex");

  // Check if a frontend API user already exists
  const users = await client.request(
    `/users?filter[role][_eq]=${frontendRole.id}&limit=-1`,
  );

  if (users.length > 0) {
    // Update existing user with a new token
    const user = users[0];
    console.log("Updating existing frontend API user:", user.id);
    await client.request(`/users/${user.id}`, {
      method: "PATCH",
      body: JSON.stringify({ token }),
    });
    console.log("Token updated.");
  } else {
    // Create a new user
    console.log("Creating new frontend API user...");
    const newUser = await client.request("/users", {
      method: "POST",
      body: JSON.stringify({
        first_name: "Frontend",
        last_name: "API",
        email: "frontend-api@deere-shop.local",
        role: frontendRole.id,
        token,
        status: "active",
      }),
    });
    console.log("Created user:", newUser.id);
  }

  console.log("\n=== DIRECTUS_TOKEN ===");
  console.log(token);
  console.log("=====================");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});