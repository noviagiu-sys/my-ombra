/* VisuClean v8.2 · automatischer struktureller WCAG-Smoke-Test */
import "fake-indexeddb/auto";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

const dom = new JSDOM("<!doctype html><html lang=\"de\"><head><title>VisuClean</title></head><body><div id=\"root\"></div></body></html>", {
  url: "https://visuclean.test/", pretendToBeVisual: true,
});
for (const name of ["window", "document", "HTMLElement", "HTMLCanvasElement", "Node", "MutationObserver", "getComputedStyle", "localStorage", "Image", "Blob", "URL"]) {
  Object.defineProperty(globalThis, name, { value: dom.window[name], configurable: true, writable: true });
}
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true, writable: true });
Object.defineProperty(dom.window, "indexedDB", { value: globalThis.indexedDB, configurable: true });
Object.defineProperty(dom.window, "IDBKeyRange", { value: globalThis.IDBKeyRange, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = (await import("react")).default;
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const axe = (await import("axe-core")).default;
const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });

const checks = [];
function ok(id, name, passed, info = "") {
  checks.push({ id, passed });
  console.log(`${passed ? "BESTANDEN    " : "DURCHGEFALLEN"} ${id}  ${name}`);
  if (info) console.log(`                    ${info}`);
}
async function audit(label) {
  const result = await axe.run(document, {
    rules: {
      "color-contrast": { enabled: false },
      "color-contrast-enhanced": { enabled: false },
    },
  });
  return { label, violations: result.violations };
}

console.log("VisuClean · struktureller Accessibility-Test\n");
try {
  const { default: VisuClean } = await vite.ssrLoadModule("/src/App.jsx");
  const container = document.getElementById("root");
  let root = createRoot(container);
  await act(async () => { root.render(React.createElement(VisuClean)); });
  const login = await audit("Login");
  ok("A1", "Login hat keine automatisiert erkennbaren strukturellen WCAG-Verstoesse",
    login.violations.length === 0, login.violations.map(item => item.id).join(", "));
  ok("A2", "Login ist vollstaendig per Tab erreichbaren Controls aufgebaut",
    [...document.querySelectorAll("button,input,select,textarea")].every(element => !element.hasAttribute("tabindex") || Number(element.getAttribute("tabindex")) >= 0));

  await act(async () => { root.unmount(); });
  container.replaceChildren();
  root = createRoot(container);
  const operator = { username: "operator1", displayName: "Operator 1", role: "Operator" };
  await act(async () => {
    root.render(React.createElement(VisuClean, { initialUser: operator }));
  });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 120)); });
  const home = await audit("Home");
  ok("A3", "Home hat keine automatisiert erkennbaren strukturellen WCAG-Verstoesse",
    home.violations.length === 0, home.violations.map(item => item.id).join(", "));
  ok("A4", "Alle Home-Aktionen sind native Buttons mit Text oder Accessible Name",
    [...document.querySelectorAll("button")].every(button => button.textContent.trim() || button.getAttribute("aria-label")));
  ok("A5", "Dokumentsprache ist gesetzt", document.documentElement.lang === "de");
  const newInspection = [...document.querySelectorAll("button")].find(button => button.textContent.includes("Neue Prüfung"));
  await act(async () => { newInspection.click(); });
  ok("A6", "Pruefstart fuehrt in die Equipment-Auswahl",
    document.querySelector("h1")?.textContent === "Equipment wählen" && Boolean(document.getElementById("equipment-code")));
  const codeInput = document.getElementById("equipment-code");
  if (codeInput) await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set;
    setter.call(codeInput, "tp|Matrizenteller");
    codeInput.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
  const checkCode = [...document.querySelectorAll("button")].find(button => button.textContent.includes("Code prüfen"));
  if (checkCode) await act(async () => { checkCode.click(); });
  ok("A7", "QR-Payload kann direkt in die zugehoerige Zone springen",
    document.querySelector(".screen-heading p")?.textContent.includes("Matrizenteller"));
  const capture = await audit("Capture");
  ok("A8", "Leerer Kamera-Screen hat keine strukturellen WCAG-Verstoesse",
    capture.violations.length === 0, capture.violations.map(item => item.id).join(", "));
  await act(async () => { root.unmount(); });
} finally {
  await vite.close();
  dom.window.close();
}

console.log("");
const failed = checks.filter(check => !check.passed);
console.log(`Bestanden: ${checks.length - failed.length} / ${checks.length}`);
if (failed.length) console.log(`Durchgefallen: ${failed.map(check => check.id).join(", ")}`);
console.log(`ERGEBNIS: ${failed.length ? "DURCHGEFALLEN" : "BESTANDEN"}`);
process.exit(failed.length ? 1 : 0);
