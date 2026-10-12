import { mountApp } from './mount.ts';
import { openSettingsModal } from './components/settings-modal.ts';

const root = document.querySelector('#root');
if (root) {
  void mountApp(root as HTMLElement).then(() => {
    if (location.hash === '#settings') openSettingsModal();
  });
}
