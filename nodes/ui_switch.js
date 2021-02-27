const fs = require("fs")

function getFileContext (RED) {
    try {
        const contextPlugins = require(RED.settings.settingsFile).contextStorage || {}
        for (const [key, value] of Object.entries(contextPlugins)) {
            if (value.module && value.module === "localfilesystem") {
                return key
            }
        }
    } catch (_) {}
}

module.exports = function(RED) {
    var ui = require('../ui')(RED);

    function validateSwitchValue(node,property,type,payload) {
        if (payloadType === 'flow' || payloadType === 'global') {
            try {
                var parts = RED.util.normalisePropertyExpression(payload);
                if (parts.length === '') {
                    throw new Error();
                }
            } catch(err) {
                node.warn("Invalid payload property expression - defaulting to node id")
                payload = node.id;
                payloadType = 'str';
            }
        }
        else {
            payload = payload || node.id;
        }
    }
    function addTopic(config, node, msg) {
        var t = RED.util.evaluateNodeProperty(config.topic,config.topicType || "str",node,msg) || node.topi;
        if (t) { msg.topic = t; }
    }
    var stateContextStore = getFileContext(RED);
    if (!stateContextStore) {
        config.storestate = false
        node.warn('No local file system context plugin found')
    }
    var stateContextVariableName = "_dashboard-state";
    function saveState(config, node, value) {
        if (!config.storestate) {
            return;
        }
        var state = node.context().global.get(stateContextVariableName, stateContextStore) || {};
        state[node.id] = value;
        node.context().global.set(stateContextVariableName, state, stateContextStore);
    }

    function getState(config, node) {
        if (!config.storestate) {
            return false;
        }
        var state = node.context().global.get(stateContextVariableName, stateContextStore) || {};
        node.emit("input",{})
        return Boolean(state[node.id]);
    }

    function SwitchNode(config) {
        RED.nodes.createNode(this, config);
        this.pt = config.passthru;
        this.state = ["off"," "];
        this.decouple = (config.decouple === "true") ? false : true;
        var node = this;
        node.status({});

        var group = RED.nodes.getNode(config.group);
        if (!group) { return; }
        var tab = RED.nodes.getNode(group.config.tab);
        if (!tab) { return; }

        var parts;
        var onvalue = config.onvalue;
        var onvalueType = config.onvalueType;
        if (onvalueType === 'flow' || onvalueType === 'global') {
            try {
                parts = RED.util.normalisePropertyExpression(onvalue);
                if (parts.length === 0) {
                    throw new Error();
                }
            } catch(err) {
                node.warn("Invalid onvalue property expression - defaulting to true")
                onvalue = true;
                onvalueType = 'bool';
            }
        }
        var offvalue = config.offvalue;
        var offvalueType = config.offvalueType;
        if (offvalueType === 'flow' || offvalueType === 'global') {
            try {
                parts = RED.util.normalisePropertyExpression(offvalue);
                if (parts.length === 0) {
                    throw new Error();
                }
            } catch(err) {
                node.warn("Invalid offvalue property expression - defaulting to false")
                offvalue = false;
                offvalueType = 'bool';
            }
        }

        node.on("input", function(msg) {
            node.topi = msg.topic;
        });
        if (config.storestate && config.passthru) {
            var initMsg = function () {
                msg = { payload: getState(config, node)};
                addTopic(config, node, msg);
                node.send(msg)
                RED.events.removeListener("nodes-started", initMsg)
            }
            RED.events.on("nodes-started", initMsg)
        }

        var done = ui.add({
            node: node,
            tab: tab,
            group: group,
            emitOnlyNewValues: false,
            forwardInputMessages: config.passthru,
            storeFrontEndInputAsState: (config.decouple === "true") ? false : true, //config.passthru,
            state: false,
            control: {
                type: 'switch' + (config.style ? '-' + config.style : ''),
                label: config.label,
                tooltip: config.tooltip,
                order: config.order,
                value: getState(config, node),
                onicon: config.onicon,
                officon: config.officon,
                oncolor: config.oncolor,
                offcolor: config.offcolor,
                animate: config.animate?"flip-icon":"",
                width: config.width || group.config.width || 6,
                height: config.height || 1
            },
            convert: function (payload, oldval, msg) {
                var myOnValue,myOffValue;

                if (onvalueType === "date") { myOnValue = Date.now(); }
                else { myOnValue = RED.util.evaluateNodeProperty(onvalue,onvalueType,node); }

                if (offvalueType === "date") { myOffValue = Date.now(); }
                else { myOffValue = RED.util.evaluateNodeProperty(offvalue,offvalueType,node); }

                if (!this.forwardInputMessages && this.storeFrontEndInputAsState) {
                    if (myOnValue === oldval) { return true; }
                    if (oldval === true) { return true; }
                    else { return false; }
                }

                if (RED.util.compareObjects(myOnValue,msg.payload)) { node.state[0] = "on"; return true; }
                else if (RED.util.compareObjects(myOffValue,msg.payload)) { node.state[0] = "off"; return false; }
                else { return oldval; }
            },
            convertBack: function (value) {
                node.state[1] = value?"on":"off";
                if (node.pt) {
                    node.status({fill:(value?"green":"red"),shape:(value?"dot":"ring"),text:value?"on":"off"});
                }
                else {
                    var col = (node.decouple) ? ((node.state[1]=="on")?"green":"red") : ((node.state[0]=="on")?"green":"red");
                    var shp = (node.decouple) ? ((node.state[1]=="on")?"dot":"ring") : ((node.state[0]=="on")?"dot":"ring");
                    var txt = (node.decouple) ? (node.state[0] +" | "+node.state[1].toUpperCase()) : (node.state[0].toUpperCase() +" | "+node.state[1])
                    node.status({fill:col, shape:shp, text:txt});
                }
                var payload = value ? onvalue : offvalue;
                var payloadType = value ? onvalueType : offvalueType;

                if (payloadType === "date") { value = Date.now(); }
                else { value = RED.util.evaluateNodeProperty(payload,payloadType,node); }
                return value;
            },
            beforeSend: function (msg) {
                addTopic(config, node, msg);
                saveState(config, node, msg.payload)
            }
        });

        if (!node.pt) {
            node.on("input", function() {
                var col = (node.state[0]=="on") ? "green" : "red";
                var shp = (node.state[0]=="on") ? "dot" : "ring";
                var txt = (node.decouple) ? (node.state[0] +" | "+node.state[1].toUpperCase()) : (node.state[0].toUpperCase() +" | "+node.state[1])
                node.status({fill:col, shape:shp, text:txt});
            });
        }

        node.on("close", done);
    }
    RED.nodes.registerType("ui_switch", SwitchNode);
};
