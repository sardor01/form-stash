export default defineBackground(() => {
  if (browser.sidePanel?.setPanelBehavior) {
    browser.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch((err) =>
        console.error('[form-stash] sidePanel.setPanelBehavior failed', err),
      );
  }
});
