import type { Attachment } from 'svelte/attachments';

/** Mount the node under `document.body` so `fixed` overlays cover the viewport. */
export const portalToBody: Attachment = (node) => {
  document.body.append(node);
  return () => {
    node.remove();
  };
};
