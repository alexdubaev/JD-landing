import { defineInterface, useApi } from "@directus/extensions-sdk";
import { defineComponent, h, ref, watch } from "vue";

import { interfaceDefinition } from "./definition.mjs";
import {
  buildGalleryRequest,
  createGalleryPreviewVNode,
} from "./gallery-preview.mjs";

const InterfaceComponent = defineComponent({
  name: "DeereShopProductGalleryPreview",
  props: {
    primaryKey: {
      type: [String, Number],
      default: null,
    },
  },
  setup(props) {
    const api = useApi();
    const rows = ref([]);
    const loading = ref(false);
    const error = ref(null);
    let requestSequence = 0;

    watch(
      () => props.primaryKey,
      async (primaryKey) => {
        const requestId = ++requestSequence;
        rows.value = [];
        error.value = null;

        if (primaryKey == null || primaryKey === "+") {
          loading.value = false;
          return;
        }

        loading.value = true;
        try {
          const response = await api.get(
            "/items/product_images",
            buildGalleryRequest(primaryKey),
          );
          if (requestId !== requestSequence) return;
          rows.value = Array.isArray(response?.data?.data) ? response.data.data : [];
        } catch (cause) {
          if (requestId !== requestSequence) return;
          error.value = cause instanceof Error ? cause.message : String(cause);
        } finally {
          if (requestId === requestSequence) loading.value = false;
        }
      },
      { immediate: true },
    );

    return () =>
      createGalleryPreviewVNode(h, rows.value, {
        loading: loading.value,
        error: error.value,
      });
  },
});

export default defineInterface({
  ...interfaceDefinition,
  component: InterfaceComponent,
});
