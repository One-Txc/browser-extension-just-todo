/** MV3 用 chrome.action，MV2(Firefox) 用 browserAction；统一取其一 */
type ActionApi = {
  onClicked: { addListener(cb: () => void): void };
};

export function actionApi(): ActionApi {
  const c = chrome as unknown as { action?: ActionApi; browserAction?: ActionApi };
  if (!c.action && !c.browserAction) throw new Error('no action api');
  return (c.action ?? c.browserAction) as ActionApi;
}
