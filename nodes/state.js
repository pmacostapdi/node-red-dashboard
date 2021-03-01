var globalRED
var globalStateContextVariableName = "state"
var globalStateContextStore

module.exports = function (RED) {
  globalRED = RED
  globalStateContextStore = getFileContext(globalRED)
  return {
    addTopic: addTopic,
    checkContextStore: checkContextStore,
    getFileContext: getFileContext,
    getState: getState,
    passInitState: passInitState,
    saveState: saveState,
  }
}

function addTopic(config, node, msg) {
  var t =
    globalRED.util.evaluateNodeProperty(
      config.topic,
      config.topicType || "str",
      node,
      msg
    ) || node.topi
  if (t) {
    msg.topic = t
  }
}

function checkContextStore(config, node) {
  if (!globalStateContextStore) {
    config.storestate = false
    node.warn("No local file system context plugin found")
  }
}

function getFileContext() {
  if (globalStateContextStore !== undefined) {
    return globalStateContextStore
  }
  try {
    const contextPlugins = require(globalRED.settings.settingsFile).contextStorage || {}
    for (const [key, value] of Object.entries(contextPlugins)) {
      if (value.module && value.module === "localfilesystem") {
        return key
      }
    }
  } catch (error) {
    console.log(error)
  }
}

function getState(config, node) {
  if (!config.storestate) {
    return false
  }
  var state = node
    .context()
    .get(globalStateContextVariableName, globalStateContextStore)
  node.emit("input", {})
  return Boolean(state)
}

function passInitState(config, node, initState) {
  if (config.storestate && config.passthru) {
    initState = initState || getState(config, node)
    var initMsg = function () {
      globalRED.events.removeListener("nodes-started", initMsg)
      var msg = { payload: initState }
      addTopic(config, node, msg)
      var timer = setTimeout(() => {
        clearTimeout(timer)
        node.send(msg)
      }, 300)
    }
    globalRED.events.on("nodes-started", initMsg)
  }
}

function saveState(config, node, state) {
  if (!config.storestate) {
    return
  }
  var callback = function (error) {
    if (error) {
      node.warn("state could not be saved: " + error.message)
    }
  }
  node
    .context()
    .set(globalStateContextVariableName, state, globalStateContextStore, callback)
}
