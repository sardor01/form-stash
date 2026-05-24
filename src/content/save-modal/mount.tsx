import ReactDOM from 'react-dom/client';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import type { Preset } from '../../shared/types';
import { SaveModalApp, type ModalSnapshot } from './SaveModalApp';

interface OpenArgs {
  snapshot: ModalSnapshot;
  onSaved?: (preset: Preset) => void;
  showContinueSubmit?: boolean;
  onContinueSubmit?: () => void;
}

interface ModalHandle {
  open: (args: OpenArgs) => void;
}

let cached: ModalHandle | null = null;
let pending: Promise<ModalHandle> | null = null;

export async function ensureSaveModal(
  ctx: ContentScriptContext,
): Promise<ModalHandle> {
  if (cached) return cached;
  if (pending) return pending;

  pending = (async () => {
    const ui = await createShadowRootUi(ctx, {
      name: 'form-stash-save-modal',
      position: 'overlay',
      anchor: 'body',
      isolateEvents: true,
      onMount: (container) => {
        const root = ReactDOM.createRoot(container);
        return { root };
      },
      onRemove: (mounted) => {
        mounted?.root.unmount();
      },
    });

    let current: ReturnType<typeof ui.mount> extends void ? unknown : unknown =
      null;
    void current;

    const handle: ModalHandle = {
      open: ({
        snapshot,
        onSaved,
        showContinueSubmit,
        onContinueSubmit,
      }) => {
        ui.mount();
        const mounted = ui.mounted;
        if (!mounted) return;
        const close = () => {
          ui.remove();
        };
        mounted.root.render(
          <SaveModalApp
            snapshot={snapshot}
            onClose={close}
            onSaved={(p) => onSaved?.(p)}
            showContinueSubmit={showContinueSubmit}
            onContinueSubmit={() => {
              close();
              onContinueSubmit?.();
            }}
          />,
        );
      },
    };

    cached = handle;
    pending = null;
    return handle;
  })();

  return pending;
}
