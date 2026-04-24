import { els, state } from "./state.js";

export function createUiModule(deps) {
  function notify(message) {
    els.toast.textContent = message;
    els.toast.classList.add("show");
    window.setTimeout(() => els.toast.classList.remove("show"), 2400);
  }

  function updateInstallButton() {
    if (!els.installApp) return;
    const standalone = window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone;
    const canInstall = Boolean(state.deferredInstallPrompt) && !standalone;
    els.installApp.classList.toggle("is-hidden", !canInstall);
  }

  function setupPwaSupport() {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("./sw.js").catch((error) => {
          console.error("Service worker error", error);
        });
      });
    }

    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      state.deferredInstallPrompt = event;
      updateInstallButton();
    });

    window.addEventListener("appinstalled", () => {
      state.deferredInstallPrompt = null;
      updateInstallButton();
      notify("Finance Flow instalado com sucesso.");
    });

    updateInstallButton();
  }

  async function promptInstallApp() {
    if (!state.deferredInstallPrompt) {
      notify("A instalacao ainda nao esta disponivel neste navegador.");
      return;
    }

    state.deferredInstallPrompt.prompt();
    const choice = await state.deferredInstallPrompt.userChoice.catch(() => null);
    state.deferredInstallPrompt = null;
    updateInstallButton();

    if (choice?.outcome === "accepted") {
      notify("Instalacao iniciada.");
    }
  }

  return { notify, updateInstallButton, setupPwaSupport, promptInstallApp };
}
