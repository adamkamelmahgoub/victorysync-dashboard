const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("tracker", {
  state: () => ipcRenderer.invoke("state"),
  login: (email, password) => ipcRenderer.invoke("login", { email, password }),
  logout: () => ipcRenderer.invoke("logout"),
  consent: () => ipcRenderer.invoke("consent"),
  timer: (action, campaign) =>
    ipcRenderer.invoke("timer", { action, campaign }),
  onState: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on("state", listener);
    return () => ipcRenderer.removeListener("state", listener);
  },
});
