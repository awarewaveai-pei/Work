// VW_* is the name; SEEDSTAR_* is read once with a warning so a launcher that still sets it keeps working.
const warned = new Set();
function vwEnv(env, name) {
  if (env["VW_" + name] !== undefined) return env["VW_" + name];
  const old = env["SEEDSTAR_" + name];
  if (old !== undefined && !warned.has(name)) {
    warned.add(name);
    console.warn("[video-workbench] SEEDSTAR_" + name + " is deprecated; set VW_" + name + " instead.");
  }
  return old;
}
module.exports = { vwEnv };
