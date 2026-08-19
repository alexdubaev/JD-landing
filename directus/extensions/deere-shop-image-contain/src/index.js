import { defineDisplay } from "@directus/extensions-sdk";
import { defineComponent, h } from "vue";

import { displayDefinition } from "./definition.mjs";
import { createContainImageVNode } from "./render-image.mjs";

const DisplayComponent = defineComponent({
  name: "DeereShopImageContain",
  props: {
    value: {
      type: [Object, String],
      default: null,
    },
  },
  setup(props) {
    return () => createContainImageVNode(h, props.value);
  },
});

export default defineDisplay({
  ...displayDefinition,
  component: DisplayComponent,
});
