/** Browser agent surface. resolvePlace is read-only. The other methods move the map. */

export function installAtlasApi(controller) {
  const api = {
    locate(opts = {}) {
      return controller.locate(opts);
    },
    setYear(year) {
      return controller.setYear(year);
    },
    resolvePlace(place, year) {
      return controller.resolvePlace(place, year);
    },
    inspect(opts = {}) {
      return controller.inspect(opts);
    },
    plotTrajectory(opts = {}) {
      return controller.plotTrajectory(opts);
    },
    playRoute(slug) {
      return controller.playRoute(slug);
    },
    getState() {
      return controller.getState();
    },
  };
  window.atlasAPI = api;
  return api;
}
