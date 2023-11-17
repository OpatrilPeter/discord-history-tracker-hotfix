let SAVE = null;
let SAVE_RESET = null;
(function() {
	const url = window.location.href;

	if (!url.includes("discord.com/") && !url.includes("discordapp.com/") && !confirm("Could not detect Discord in the URL, do you want to run the script anyway?")) {
		return;
	}

	if (window.DHT_LOADED) {
		alert("Discord History Tracker is already loaded.");
		return;
	}

	window.DHT_LOADED = true;
	window.DHT_ON_UNLOAD = [];

// noinspection JSUnresolvedVariable
class DISCORD {
	static getMessageOuterElement() {
		return DOM.queryReactClass("messagesWrapper");
	}

	static getMessageScrollerElement() {
		return DOM.queryReactClass("scroller", this.getMessageOuterElement());
	}

	static getMessageElements() {
		return this.getMessageOuterElement().querySelectorAll("[class*='message_']");
	}

	static hasMoreMessages() {
		return document.querySelector("#messagesNavigationDescription + [class^=container]") === null;
	}

	static loadOlderMessages() {
		const view = this.getMessageScrollerElement();

		if (view.scrollTop > 0) {
			view.scrollTop = 0;
		}
	}

	/**
	 * Calls the provided function with a list of messages whenever the currently loaded messages change.
	 */
	static setupMessageCallback(callback) {
		let skipsLeft = 0;
		let waitForCleanup = false;
		const previousMessages = new Set();

		const timer = window.setInterval(() => {
			if (skipsLeft > 0) {
				--skipsLeft;
				return;
			}

			const view = this.getMessageOuterElement();

			if (!view) {
				skipsLeft = 2;
				return;
			}

			const anyMessage = DOM.queryReactClass("message", this.getMessageOuterElement());
			const messageCount = anyMessage ? anyMessage.parentElement.children.length : 0;

			if (messageCount > 300) {
				if (waitForCleanup) {
					return;
				}

				skipsLeft = 3;
				waitForCleanup = true;

				window.setTimeout(() => {
					const view = this.getMessageScrollerElement();
					// noinspection JSUnusedGlobalSymbols
					view.scrollTop = view.scrollHeight / 2;
				}, 1);
			}
			else {
				waitForCleanup = false;
			}

			const messages = this.getMessages();
			const hasChanged = messages.some(message => !previousMessages.has(message.id)) || !this.hasMoreMessages();

			if (!hasChanged) {
				return;
			}

			previousMessages.clear();
			for (const message of messages) {
				previousMessages.add(message.id);
			}

			callback(messages);
		}, 200);

		window.DHT_ON_UNLOAD.push(() => window.clearInterval(timer));
	}

	/**
	 * Returns the property object of a message element.
	 * @returns { null | { message: DiscordMessage, channel: Object } }
	 */
	static getMessageElementProps(ele) {
		const props = DOM.getReactProps(ele);

		if (props.children && props.children.length) {
			for (let i = 3; i < props.children.length; i++) {
				const childProps = props.children[i].props;

				if (childProps && "message" in childProps && "channel" in childProps) {
					return childProps;
				}
			}
		}

		return null;
	}

	/**
	 * Returns an array containing currently loaded messages.
	 */
	static getMessages() {
		try {
			const messages = [];

			for (const ele of this.getMessageElements()) {
				try {
					const props = this.getMessageElementProps(ele);

					if (props != null) {
						messages.push(props.message);
					}
				} catch (e) {
					console.error("[DHT] Error extracing message data, skipping it.", e, ele, DOM.tryGetReactProps(ele));
				}
			}

			return messages;
		} catch (e) {
			console.error("[DHT] Error retrieving messages.", e);
			return [];
		}
	}

	/**
	 * Returns an object containing the selected server and channel information.
	 * For types DM and GROUP, the server and channel ids and names are identical.
	 * @returns { {} | null }
	 */
	static getSelectedChannel() {
		try {
			let obj;

			try {
				for (const child of DOM.getReactProps(DOM.queryReactClass("chatContent")).children) {
					if (child && child.props && child.props.channel) {
						obj = child.props.channel;
						break;
					}
				}
			} catch (e) {
				console.error("[DHT] Error retrieving selected channel from 'chatContent' element.", e);

				for (const ele of this.getMessageElements()) {
					const props = this.getMessageElementProps(ele);

					if (props != null) {
						obj = props.channel;
						break;
					}
				}
			}

			if (!obj || typeof obj.id !== "string") {
				return null;
			}

			const dms = DOM.queryReactClass("privateChannels");

			if (dms) {
				let name;

				for (const ele of dms.querySelectorAll("[class*='channel_'] [class*='selected_'] [class^='name_'] *")) {
					const node = Array.prototype.find.call(ele.childNodes, node => node.nodeType === Node.TEXT_NODE);

					if (node) {
						name = node.nodeValue;
						break;
					}
				}

				if (!name) {
					return null;
				}

				let type;

				// https://discord.com/developers/docs/resources/channel#channel-object-channel-types
				switch (obj.type) {
					case 1: type = "DM"; break;
					case 3: type = "GROUP"; break;
					default: return null;
				}

				const id = obj.id;
				const server = { id, name, type };
				const channel = { id, name };

				return { server, channel };
			}
			else if (obj.guild_id) {
				let guild;

				for (const child of DOM.getReactProps(document.querySelector("nav header [class*='headerContent_']")).children) {
					if (child && child.props && child.props.guild) {
						guild = child.props.guild;
						break;
					}
				}

				if (!guild || typeof guild.name !== "string" || obj.guild_id !== guild.id) {
					return null;
				}

				const server = {
					"id": guild.id,
					"name": guild.name,
					"type": "SERVER"
				};

				const channel = {
					"id": obj.id,
					"name": obj.name,
					"extra": {
						"nsfw": obj.nsfw
					}
				};

				if (obj.parent_id) {
					channel["extra"]["parent"] = obj.parent_id;
				}
				else {
					channel["extra"]["position"] = obj.position;
					channel["extra"]["topic"] = obj.topic;
				}

				return { server, channel };
			}
			else {
				return null;
			}
		} catch (e) {
			console.error("[DHT] Error retrieving selected channel.", e);
			return null;
		}
	}

	/**
	 * Selects the next text channel and returns true, otherwise returns false if there are no more channels.
	 */
	static selectNextTextChannel() {
		const dms = DOM.queryReactClass("privateChannels");

		if (dms) {
			const currentChannel = DOM.queryReactClass("selected", dms);
			const currentChannelContainer = currentChannel && currentChannel.closest("[class*='channel_']");
			const nextChannel = currentChannelContainer && currentChannelContainer.nextElementSibling;

			if (!nextChannel || !nextChannel.getAttribute("class").includes("channel_")) {
				return false;
			}

			const nextChannelLink = nextChannel.querySelector("a[href*='/@me/']");
			if (!nextChannelLink) {
				return false;
			}

			nextChannelLink.click();
			nextChannelLink.scrollIntoView(true);
			return true;
		}
		else {
			const channelListEle = document.getElementById("channels");
			if (!channelListEle) {
				return false;
			}

			function getLinkElement(channel) {
				return channel.querySelector("a[href^='/channels/'][role='link']");
			}

			const allTextChannels = Array.prototype.filter.call(channelListEle.querySelectorAll("[class*='containerDefault']"), ele => getLinkElement(ele) !== null);
			let nextChannel = null;

			for (let index = 0; index < allTextChannels.length - 1; index++) {
				if (allTextChannels[index].className.includes("selected_")) {
					nextChannel = allTextChannels[index + 1];
					break;
				}
			}

			if (nextChannel === null) {
				return false;
			}

			const nextChannelLink = getLinkElement(nextChannel);
			if (!nextChannelLink) {
				return false;
			}

			nextChannelLink.click();
			nextChannel.scrollIntoView(true);
			return true;
		}
	}
}
class DOM {
	/**
	 * Returns a child element by its ID. Parent defaults to the entire document.
	 * @returns {HTMLElement}
	 */
	static id(id, parent) {
		return (parent || document).getElementById(id);
	}

	/**
	 * Returns the first child element containing the specified obfuscated class. Parent defaults to the entire document.
	 */
	static queryReactClass(cls, parent) {
		return (parent || document).querySelector(`[class*="${cls}_"]`);
	}

	/**
	 * Creates an element, adds it to the DOM, and returns it.
	 */
	static createElement(tag, parent, id, html) {
		/** @type HTMLElement */
		const ele = document.createElement(tag);
		ele.id = id || "";
		ele.innerHTML = html || "";
		parent.appendChild(ele);
		return ele;
	}

	/**
	 * Removes an element from the DOM.
	 */
	static removeElement(ele) {
		return ele.parentNode.removeChild(ele);
	}

	/**
	 * Creates a new style element with the specified CSS and returns it.
	 */
	static createStyle(styles) {
		return this.createElement("style", document.head, "", styles);
	}

	/**
	 * Utility function to save an object into a cookie.
	 */
	static saveToCookie(name, obj, expiresInSeconds) {
		const expires = new Date(Date.now() + 1000 * expiresInSeconds).toUTCString();
		document.cookie = name + "=" + encodeURIComponent(JSON.stringify(obj)) + ";path=/;expires=" + expires;
	}

	/**
	 * Utility function to load an object from a cookie.
	 */
	static loadFromCookie(name) {
		const value = document.cookie.replace(new RegExp("(?:(?:^|.*;\\s*)" + name + "\\s*\\=\\s*([^;]*).*$)|^.*$"), "$1");
		return value.length ? JSON.parse(decodeURIComponent(value)) : null;
	}

	/**
	 * Returns internal React state object of an element.
	 */
	static getReactProps(ele) {
		const keys = Object.keys(ele || {});
		let key = keys.find(key => key.startsWith("__reactInternalInstance"));

		if (key) {
			// noinspection JSUnresolvedVariable
			return ele[key].memoizedProps;
		}

		key = keys.find(key => key.startsWith("__reactProps$"));
		return key ? ele[key] : null;
	}

	/**
	 * Returns internal React state object of an element, or null if the retrieval throws.
	 */
	static tryGetReactProps(ele) {
		try {
			return this.getReactProps(ele);
		} catch (e) {
			return null;
		}
	}
}
// noinspection FunctionWithInconsistentReturnsJS
const GUI = (function() {
	let controller = null;
	let settings = null;

	const stateChangedEvent = () => {
		if (settings) {
			settings.ui.cbAutoscroll.checked = SETTINGS.autoscroll;
			settings.ui.optsAfterFirstMsg[SETTINGS.afterFirstMsg].checked = true;
			settings.ui.optsAfterSavedMsg[SETTINGS.afterSavedMsg].checked = true;

			const autoscrollDisabled = !SETTINGS.autoscroll;
			Object.values(settings.ui.optsAfterFirstMsg).forEach(ele => ele.disabled = autoscrollDisabled);
			Object.values(settings.ui.optsAfterSavedMsg).forEach(ele => ele.disabled = autoscrollDisabled);
		}
	};

	return {
		showController() {
			if (controller) {
				return;
			}

			const html = `
<button id='dht-ctrl-close'>X</button>
<button id='dht-ctrl-settings'>Settings</button>
<button id='dht-ctrl-track'></button>
<p id='dht-ctrl-status'>Waiting</p>`;

			controller = {
				styles: DOM.createStyle(`#app-mount {
					height: calc(100% - 48px) !important;
				  }

				  #dht-ctrl {
					position: absolute;
					bottom: 0;
					width: 100%;
					height: 48px;
					background-color: #fff;
					z-index: 1000000;
				  }

				  #dht-ctrl button {
					height: 32px;
					margin: 8px 0 8px 8px;
					font-size: 16px;
					padding: 0 12px;
					background-color: #7289da;
					color: #fff;
					text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.75);
				  }

				  #dht-ctrl button:disabled {
					background-color: #7a7a7a;
					cursor: default;
				  }

				  #dht-ctrl p {
					display: inline-block;
					margin: 14px 12px;
				  }
				  `),
				ele: DOM.createElement("div", document.body, "dht-ctrl", html)
			};

			controller.ui = {
				btnSettings: DOM.id("dht-ctrl-settings"),
				btnTrack: DOM.id("dht-ctrl-track"),
				btnClose: DOM.id("dht-ctrl-close"),
				textStatus: DOM.id("dht-ctrl-status")
			};

			controller.ui.btnSettings.addEventListener("click", () => {
				this.showSettings();
			});

			controller.ui.btnTrack.addEventListener("click", () => {
				const isTracking = !STATE.isTracking();
				STATE.setIsTracking(isTracking);

				if (!isTracking) {
					controller.ui.textStatus.innerText = "Stopped";
				}
			});

			controller.ui.btnClose.addEventListener("click", () => {
				this.hideController();
				window.DHT_ON_UNLOAD.forEach(f => f());
				delete window.DHT_ON_UNLOAD;
				delete window.DHT_LOADED;
			});

			STATE.onTrackingStateChanged(isTracking => {
				controller.ui.btnTrack.innerText = isTracking ? "Pause Tracking" : "Start Tracking";
				controller.ui.btnSettings.disabled = isTracking;
			});

			SETTINGS.onSettingsChanged(stateChangedEvent);
			stateChangedEvent();
		},

		hideController() {
			if (controller) {
				DOM.removeElement(controller.ele);
				DOM.removeElement(controller.styles);
				controller = null;
			}
		},

		showSettings() {
			if (settings) {
				return;
			}

			const radio = (type, id, label) => "<label><input id='dht-cfg-" + type + "-" + id + "' name='dht-" + type + "' type='radio'> " + label + "</label><br>";
			const html = `
<label><input id='dht-cfg-autoscroll' type='checkbox'> Autoscroll</label><br>
<br>
<label>After reaching the first message in channel...</label><br>
${radio("afm", "nothing", "Do Nothing")}
${radio("afm", "pause", "Pause Tracking")}
${radio("afm", "switch", "Switch to Next Channel")}
<br>
<label>After reaching a previously saved message...</label><br>
${radio("asm", "nothing", "Do Nothing")}
${radio("asm", "pause", "Pause Tracking")}
${radio("asm", "switch", "Switch to Next Channel")}
<p id='dht-cfg-note'>It is recommended to disable link and image previews to avoid putting unnecessary strain on your browser.</p>`;

			settings = {
				styles: DOM.createStyle(`#dht-cfg-overlay {
					position: absolute;
					left: 0;
					top: 0;
					width: 100%;
					height: 100%;
					background-color: #000;
					opacity: 0.5;
					display: block;
					z-index: 1000001;
				  }

				  #dht-cfg {
					position: absolute;
					left: 50%;
					top: 50%;
					width: 800px;
					height: 262px;
					margin-left: -400px;
					margin-top: -131px;
					padding: 8px;
					background-color: #fff;
					z-index: 1000002;
				  }

				  #dht-cfg-note {
					margin-top: 22px;
				  }
				  `),
				overlay: DOM.createElement("div", document.body, "dht-cfg-overlay"),
				ele: DOM.createElement("div", document.body, "dht-cfg", html)
			};

			settings.overlay.addEventListener("click", () => {
				this.hideSettings();
			});

			settings.ui = {
				cbAutoscroll: DOM.id("dht-cfg-autoscroll"),
				optsAfterFirstMsg: {},
				optsAfterSavedMsg: {}
			};

			settings.ui.optsAfterFirstMsg[CONSTANTS.AUTOSCROLL_ACTION_NOTHING] = DOM.id("dht-cfg-afm-nothing");
			settings.ui.optsAfterFirstMsg[CONSTANTS.AUTOSCROLL_ACTION_PAUSE] = DOM.id("dht-cfg-afm-pause");
			settings.ui.optsAfterFirstMsg[CONSTANTS.AUTOSCROLL_ACTION_SWITCH] = DOM.id("dht-cfg-afm-switch");

			settings.ui.optsAfterSavedMsg[CONSTANTS.AUTOSCROLL_ACTION_NOTHING] = DOM.id("dht-cfg-asm-nothing");
			settings.ui.optsAfterSavedMsg[CONSTANTS.AUTOSCROLL_ACTION_PAUSE] = DOM.id("dht-cfg-asm-pause");
			settings.ui.optsAfterSavedMsg[CONSTANTS.AUTOSCROLL_ACTION_SWITCH] = DOM.id("dht-cfg-asm-switch");

			settings.ui.cbAutoscroll.addEventListener("change", () => {
				SETTINGS.autoscroll = settings.ui.cbAutoscroll.checked;
			});

			Object.keys(settings.ui.optsAfterFirstMsg).forEach(key => {
				settings.ui.optsAfterFirstMsg[key].addEventListener("click", () => {
					SETTINGS.afterFirstMsg = key;
				});
			});

			Object.keys(settings.ui.optsAfterSavedMsg).forEach(key => {
				settings.ui.optsAfterSavedMsg[key].addEventListener("click", () => {
					SETTINGS.afterSavedMsg = key;
				});
			});

			stateChangedEvent();
		},

		hideSettings() {
			if (settings) {
				DOM.removeElement(settings.overlay);
				DOM.removeElement(settings.ele);
				DOM.removeElement(settings.styles);
				settings = null;
			}
		},

		setStatus(state) {
			if (controller) {
				controller.ui.textStatus.innerText = state;
			}
		}
	};
})();
/*
 * SAVEFILE STRUCTURE
 * ==================
 *
 * {
 *   meta: {
 *     users: {
 *       <discord user id>: {
 *         name: <user name>,
 *         avatar: <user icon>,
 *         tag: <user discriminator> // only present if not a bot
 *       }, ...
 *     },
 *
 *     // the user index is an array of discord user ids,
 *     // these indexes are used in the message objects to save space
 *     userindex: [
 *       <discord user id>, ...
 *     ],
 *
 *     servers: [
 *       {
 *         name: <server name>,
 *         type: <"SERVER"|"GROUP"|DM">
 *       }, ...
 *     ],
 *
 *     channels: {
 *       <discord channel id>: {
 *         server: <server index in the meta.servers array>,
 *         name: <channel name>,
 *         position: <order in channel list>, // only present if server type == SERVER
 *         topic: <channel topic>,            // only present if server type == SERVER
 *         nsfw: <channel NSFW status>        // only present if server type == SERVER
 *       }, ...
 *     }
 *   },
 *
 *   data: {
 *     <discord channel id>: {
 *       <discord message id>: {
 *         u: <user index of the sender>,
 *         t: <message timestamp>,
 *         m: <message content>, // only present if not empty
 *         f: <message flags>,   // only present if edited in which case it equals 1, deprecated (use 'te' instead)
 *         te: <edit timestamp>, // only present if edited
 *         e: [ // omit for no embeds
 *           {
 *             url: <embed url>,
 *             type: <embed type>,
 *             t: <rich embed title>,      // only present if type == rich, and if not empty
 *             d: <rich embed description> // only present if type == rich, and if the embed has a simple description text
 *           }, ...
 *         ],
 *         a: [ // omit for no attachments
 *           {
 *             url: <attachment url>
 *           }, ...
 *         ],
 *         r: <reply message id>, // only present if referencing another message (reply)
 *         re: [ // omit for no reactions
 *           {
 *             c: <react count>
 *             n: <emoji name>,
 *             id: <emoji id>,          // only present for custom emoji
 *             an: <emoji is animated>, // only present for custom animated emoji
 *           }, ...
 *         ]
 *       }, ...
 *     }, ...
 *   }
 * }
 *
 *
 * TEMPORARY OBJECT STRUCTURE
 * ==========================
 *
 * {
 *   userlookup: {
 *     <discord user id>: <user index in the meta.userindex array>
 *   },
 *   channelkeys: Set<channel id>,
 *   messagekeys: Set<message id>,
 *   freshmsgs: Set<message id> // only messages which were newly added to the savefile in the current session
 * }
 */

class SAVEFILE{
	constructor(parsedObj){
	  var me = this;

	  if (!SAVEFILE.isValid(parsedObj)){
		parsedObj = {
		  meta: {},
		  data: {}
		};
	  }

	  me.meta = parsedObj.meta;
	  me.data = parsedObj.data;

	  me.meta.users = me.meta.users || {};
	  me.meta.userindex = me.meta.userindex || [];
	  me.meta.servers = me.meta.servers || [];
	  me.meta.channels = me.meta.channels || {};

	  me.tmp = {
		userlookup: {},
		channelkeys: new Set(),
		messagekeys: new Set(),
		freshmsgs: new Set()
	  };
	}

	static isValid(parsedObj){
	  return parsedObj && typeof parsedObj.meta === "object" && typeof parsedObj.data === "object";
	}

	findOrRegisterUser(userId, userName, userDiscriminator, userAvatar){
	  var wasPresent = userId in this.meta.users;
	  var userObj = wasPresent ? this.meta.users[userId] : {};

	  userObj.name = userName;

	  if (userDiscriminator){
		userObj.tag = userDiscriminator;
	  }

	  if (userAvatar){
		userObj.avatar = userAvatar;
	  }

	  if (!wasPresent){
		this.meta.users[userId] = userObj;
		this.meta.userindex.push(userId);
		return this.tmp.userlookup[userId] = this.meta.userindex.length-1;
	  }
	  else if (!(userId in this.tmp.userlookup)){
		return this.tmp.userlookup[userId] = this.meta.userindex.findIndex(id => id == userId);
	  }
	  else{
		return this.tmp.userlookup[userId];
	  }
	}

	findOrRegisterServer(serverName, serverType){
	  var index = this.meta.servers.findIndex(server => server.name === serverName && server.type === serverType);

	  if (index === -1){
		this.meta.servers.push({
		  "name": serverName,
		  "type": serverType
		});

		return this.meta.servers.length-1;
	  }
	  else{
		return index;
	  }
	}

	tryRegisterChannel(serverIndex, channelId, channelName, extraInfo){
	  if (!this.meta.servers[serverIndex]){
		return undefined;
	  }

	  var wasPresent = channelId in this.meta.channels;
	  var channelObj = wasPresent ? this.meta.channels[channelId] : { "server": serverIndex };

	  channelObj.name = channelName;

	  if (extraInfo.position){
		channelObj.position = extraInfo.position;
	  }

	  if (extraInfo.topic){
		channelObj.topic = extraInfo.topic;
	  }

	  if (extraInfo.nsfw){
		channelObj.nsfw = extraInfo.nsfw;
	  }

	  if (wasPresent){
		return false;
	  }
	  else{
		this.meta.channels[channelId] = channelObj;
		this.tmp.channelkeys.add(channelId);
		return true;
	  }
	}

	addMessage(channelId, messageId, messageObject){
	  var container = this.data[channelId] || (this.data[channelId] = {});
	  var wasPresent = messageId in container;

	  container[messageId] = messageObject;
	  this.tmp.messagekeys.add(messageId);
	  return !wasPresent;
	}

	convertToMessageObject(discordMessage){
	  var author = discordMessage.author;

	  var obj = {
		u: this.findOrRegisterUser(author.id, author.username, author.bot ? null : author.discriminator, author.avatar),
		t: discordMessage.timestamp.toDate().getTime()
	  };

	  if (discordMessage.content.length > 0){
		obj.m = discordMessage.content;
	  }

	  if (discordMessage.editedTimestamp !== null){
		obj.te = discordMessage.editedTimestamp.toDate().getTime();
	  }

	  if (discordMessage.embeds.length > 0){
		obj.e = discordMessage.embeds.map(embed => {
		  let conv = {
			url: embed.url,
			type: embed.type
		  };

		  if (embed.type === "rich"){
			if (Array.isArray(embed.title) && embed.title.length === 1 && typeof embed.title[0] === "string"){
			  conv.t = embed.title[0];

			  if (Array.isArray(embed.description) && embed.description.length === 1 && typeof embed.description[0] === "string"){
				conv.d = embed.description[0];
			  }
			}
		  }

		  return conv;
		});
	  }

	  if (discordMessage.attachments.length > 0){
		obj.a = discordMessage.attachments.map(attachment => ({
		  url: attachment.url
		}));
	  }

	  if (discordMessage.messageReference !== null){
		obj.r = discordMessage.messageReference.message_id;
	  }

	  if (discordMessage.reactions.length > 0) {
		obj.re = discordMessage.reactions.map(reaction => {
			let conv = {
				c: reaction.count,
				n: reaction.emoji.name
			};

			if (reaction.emoji.id !== null) {
				conv.id = reaction.emoji.id;
			}

			if (reaction.emoji.animated) {
				conv.an = true;
			}

			return conv;
		});
	  }

	  return obj;
	}

	isMessageFresh(id){
	  return this.tmp.freshmsgs.has(id);
	}

	addMessagesFromDiscord(channelId, discordMessageArray){
	  var hasNewMessages = false;

	  for(var discordMessage of discordMessageArray){
		var type = discordMessage.type;

		// https://discord.com/developers/docs/resources/channel#message-object-message-reference-structure
		if ((type === 0 || type === 19) && discordMessage.state === "SENT" && this.addMessage(channelId, discordMessage.id, this.convertToMessageObject(discordMessage))){
		  this.tmp.freshmsgs.add(discordMessage.id);
		  hasNewMessages = true;
		}
	  }

	  return hasNewMessages;
	}

	countChannels(){
	  return this.tmp.channelkeys.size;
	}

	countMessages(){
	  return this.tmp.messagekeys.size;
	}

	combineWith(obj){
	  var userMap = {};
	  var shownError = false;

	  for(var userId in obj.meta.users){
		var oldUser = obj.meta.users[userId];
		userMap[obj.meta.userindex.findIndex(id => id == userId)] = this.findOrRegisterUser(userId, oldUser.name, oldUser.tag, oldUser.avatar);
	  }

	  for(var channelId in obj.meta.channels){
		var oldServer = obj.meta.servers[obj.meta.channels[channelId].server];
		var oldChannel = obj.meta.channels[channelId];
		this.tryRegisterChannel(this.findOrRegisterServer(oldServer.name, oldServer.type), channelId, oldChannel.name, oldChannel /* filtered later */);
	  }

	  for(var channelId in obj.data){
		var oldChannel = obj.data[channelId];

		for(var messageId in oldChannel){
		  var oldMessage = oldChannel[messageId];
		  var oldUser = oldMessage.u;

		  if (oldUser in userMap){
			oldMessage.u = userMap[oldUser];
			this.addMessage(channelId, messageId, oldMessage);
		  }
		  else{
			if (!shownError){
			  shownError = true;
			  alert("The uploaded archive appears to be corrupted, some messages will be skipped. See console for details.");

			  console.error("User list:", obj.meta.users);
			  console.error("User index:", obj.meta.userindex);
			  console.error("Generated mapping:", userMap);
			  console.error("Missing user for the following messages:");
			}

			console.error(oldMessage);
		  }
		}
	  }
	}

	toJson(){
	  return JSON.stringify({
		"meta": this.meta,
		"data": this.data
	  });
	}
  }
SAVE = new SAVEFILE({});
SAVE_RESET = function() {SAVE = new SAVEFILE({});};
const CONSTANTS = {
	AUTOSCROLL_ACTION_NOTHING: "optNothing",
	AUTOSCROLL_ACTION_PAUSE: "optPause",
	AUTOSCROLL_ACTION_SWITCH: "optSwitch"
};

let IS_FIRST_RUN = false;

const SETTINGS = (function() {
	const settingsChangedEvents = [];

	const saveSettings = function() {
		DOM.saveToCookie("DHT_SETTINGS", root, 60 * 60 * 24 * 365 * 5);
	};

	const triggerSettingsChanged = function(property) {
		for (const callback of settingsChangedEvents) {
			callback(property);
		}

		saveSettings();
	};

	const defineTriggeringProperty = function(obj, property, value) {
		const name = "_" + property;

		Object.defineProperty(obj, property, {
			get: (() => obj[name]),
			set: (value => {
				obj[name] = value;
				triggerSettingsChanged(property);
			})
		});

		obj[name] = value;
	};

	let loaded = DOM.loadFromCookie("DHT_SETTINGS");

	if (!loaded) {
		loaded = {
			"_autoscroll": true,
			"_afterFirstMsg": CONSTANTS.AUTOSCROLL_ACTION_PAUSE,
			"_afterSavedMsg": CONSTANTS.AUTOSCROLL_ACTION_PAUSE
		};

		IS_FIRST_RUN = true;
	}

	const root = {
		onSettingsChanged(callback) {
			settingsChangedEvents.push(callback);
		}
	};

	defineTriggeringProperty(root, "autoscroll", loaded._autoscroll);
	defineTriggeringProperty(root, "afterFirstMsg", loaded._afterFirstMsg);
	defineTriggeringProperty(root, "afterSavedMsg", loaded._afterSavedMsg);

	if (IS_FIRST_RUN) {
		saveSettings();
	}

	return root;
})();
// noinspection FunctionWithInconsistentReturnsJS
const STATE = (function() {
	let serverPort = -1;
	let serverToken = "";

	const post = function(endpoint, json) {
		const aborter = new AbortController();
		const timeout = window.setTimeout(() => aborter.abort(), 5000);

		return new Promise(async (resolve, reject) => {
			resolve(new Response());
			return;

			let r;
			try {
				r = await fetch("http://127.0.0.1:" + serverPort + endpoint, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"X-DHT-Token": serverToken
					},
					credentials: "omit",
					redirect: "error",
					body: JSON.stringify(json),
					signal: aborter.signal
				});
			} catch (e) {
				if (e.name === "AbortError") {
					reject({ status: "DISCONNECTED" });
					return;
				}
				else {
					reject({ status: "ERROR", message: e.message });
					return;
				}
			} finally {
				window.clearTimeout(timeout);
			}

			if (r.status === 200) {
				resolve(r);
				return;
			}

			try {
				const message = await r.text();
				reject({ status: "ERROR", message });
			} catch (e) {
				reject({ status: "ERROR", message: e.message });
			}
		});
	};

	const trackingStateChangedListeners = [];
	let isTracking = false;

	const addedChannels = new Set();
	const addedUsers = new Set();

	/**
	 * @name DiscordUser
	 * @property {String} id
	 * @property {String} username
	 * @property {String} discriminator
	 * @property {String} [avatar]
	 * @property {Boolean} [bot]
	 */

	/**
	 * @name DiscordMessage
	 * @property {String} id
	 * @property {String} channel_id
	 * @property {DiscordUser} author
	 * @property {String} content
	 * @property {Timestamp} timestamp
	 * @property {Timestamp|null} editedTimestamp
	 * @property {DiscordAttachment[]} attachments
	 * @property {Object[]} embeds
	 * @property {DiscordMessageReaction[]} [reactions]
	 * @property {DiscordMessageReference} [messageReference]
	 * @property {Number} type
	 * @property {String} state
	 */

	/**
	 * @name DiscordAttachment
	 * @property {String} id
	 * @property {String} filename
	 * @property {String} [content_type]
	 * @property {String} size
	 * @property {String} url
	 */

	/**
	 * @name DiscordMessageReaction
	 * @property {DiscordEmoji} emoji
	 * @property {Number} count
	 */

	/**
	 * @name DiscordMessageReference
	 * @property {String} [message_id]
	 */

	/**
	 * @name DiscordEmoji
	 * @property {String|null} id
	 * @property {String|null} name
	 * @property {Boolean} animated
	 */

	/**
	 * @name Timestamp
	 * @property {Function} toDate
	 */

	return {
		setup(port, token) {
			serverPort = port;
			serverToken = token;
		},

		onTrackingStateChanged(callback) {
			trackingStateChangedListeners.push(callback);
			callback(isTracking);
		},

		isTracking() {
			return isTracking;
		},

		setIsTracking(state) {
			if (isTracking !== state) {
				isTracking = state;

				if (isTracking) {
					addedChannels.clear();
					addedUsers.clear();
				}

				for (const callback of trackingStateChangedListeners) {
					callback(isTracking);
				}
			}
		},

		async addDiscordChannel(serverInfo, channelInfo) {
			if (addedChannels.has(channelInfo.id)) {
				return;
			}

			const server = {
				id: serverInfo.id,
				name: serverInfo.name,
				type: serverInfo.type
			};

			const channel = {
				id: channelInfo.id,
				name: channelInfo.name
			};

			if ("extra" in channelInfo) {
				const extra = channelInfo.extra;

				if ("parent" in extra) {
					channel.parent = extra.parent;
				}

				channel.position = extra.position;
				channel.topic = extra.topic;
				channel.nsfw = extra.nsfw;
			}

			const serverSaveIndex = SAVE.findOrRegisterServer(server.name, server.type);
			SAVE.tryRegisterChannel(serverSaveIndex, channelInfo.id, channelInfo.name, channelInfo.extra || {});
			await post("/track-channel", { server, channel });
			addedChannels.add(channelInfo.id);
		},

		/**
		 * @param {String} channelId
		 * @param {DiscordMessage[]} discordMessageArray
		 */
		async addDiscordMessages(channelId, discordMessageArray) {
			// https://discord.com/developers/docs/resources/channel#message-object-message-types
			discordMessageArray = discordMessageArray.filter(msg => (msg.type === 0 || msg.type === 19 || msg.type === 21) && msg.state === "SENT");

			if (discordMessageArray.length === 0) {
				return false;
			}

			const userInfo = {};
			let hasNewUsers = false;

			for (const msg of discordMessageArray) {
				const user = msg.author;

				if (!addedUsers.has(user.id)) {
					const obj = {
						id: user.id,
						name: user.username
					};

					if (user.avatar) {
						obj.avatar = user.avatar;
					}

					if (!user.bot) {
						// noinspection JSUnusedGlobalSymbols
						obj.discriminator = user.discriminator;
					}

					userInfo[user.id] = obj;
					hasNewUsers = true;
				}
			}

			if (hasNewUsers) {
				for (const user in Object.values(userInfo)) {
					if (user.id !== undefined) {
						SAVE.findOrRegisterUser(user.id, user.name, user.discriminator, user.avatar);
					}
				}
				await post("/track-users", Object.values(userInfo));

				for (const id of Object.keys(userInfo)) {
					addedUsers.add(id);
				}
			}

			SAVE.addMessagesFromDiscord(channelId, discordMessageArray);
			const response = await post("/track-messages", discordMessageArray.map(msg => {
				const obj = {
					id: msg.id,
					sender: msg.author.id,
					channel: msg.channel_id,
					text: msg.content,
					timestamp: msg.timestamp.toDate().getTime()
				};

				if (msg.editedTimestamp !== null) {
					// noinspection JSUnusedGlobalSymbols
					obj.editTimestamp = msg.editedTimestamp.toDate().getTime();
				}

				if (msg.messageReference !== null) {
					// noinspection JSUnusedGlobalSymbols
					obj.repliedToId = msg.messageReference.message_id;
				}

				if (msg.attachments.length > 0) {
					obj.attachments = msg.attachments.map(attachment => {
						const mapped = {
							id: attachment.id,
							name: attachment.filename,
							size: attachment.size,
							url: attachment.url
						};

						if (attachment.content_type) {
							mapped.type = attachment.content_type;
						}

						if (attachment.width && attachment.height) {
							mapped.width = attachment.width;
							mapped.height = attachment.height;
						}

						return mapped;
					});
				}

				if (msg.embeds.length > 0) {
					obj.embeds = msg.embeds.map(embed => {
						const mapped = {};

						for (const key of Object.keys(embed)) {
							if (key === "id") {
								continue;
							}

							if (key === "rawTitle") {
								mapped["title"] = embed[key];
							}
							else if (key === "rawDescription") {
								mapped["description"] = embed[key];
							}
							else {
								mapped[key] = embed[key];
							}
						}

						return JSON.stringify(mapped);
					});
				}

				if (msg.reactions.length > 0) {
					obj.reactions = msg.reactions.map(reaction => {
						const emoji = reaction.emoji;

						const mapped = {
							count: reaction.count
						};

						if (emoji.id) {
							mapped.id = emoji.id;
						}

						if (emoji.name) {
							mapped.name = emoji.name;
						}

						if (emoji.animated) {
							// noinspection JSUnusedGlobalSymbols
							mapped.isAnimated = emoji.animated;
						}

						return mapped;
					});
				}

				return obj;
			}));

			const anyNewMessages = await response.text();
			// return anyNewMessages === "1";
			return true;
		}
	};
})();

	const port = 8080;
	const token = "token";
	STATE.setup(port, token);

	let delayedStopRequests = 0;
	const stopTrackingDelayed = function(callback) {
		delayedStopRequests++;

		window.setTimeout(() => {
			STATE.setIsTracking(false);
			delayedStopRequests--;

			if (callback) {
				callback();
			}
		}, 200); // give the user visual feedback after clicking the button before switching off
	};

	let hasJustStarted = false;
	let isSending = false;

	const onError = function(e) {
		console.log(e);
		GUI.setStatus(e.status === "DISCONNECTED" ? "Disconnected" : "Error");
		stopTrackingDelayed(() => isSending = false);
	};

	const isNoAction = function(action) {
		return action === null || action === CONSTANTS.AUTOSCROLL_ACTION_NOTHING;
	};

	const onTrackingContinued = function(anyNewMessages) {
		if (!STATE.isTracking()) {
			return;
		}

		GUI.setStatus("Tracking");

		if (hasJustStarted) {
			anyNewMessages = true;
			hasJustStarted = false;
		}

		isSending = false;

		if (SETTINGS.autoscroll) {
			let action = null;

			if (!DISCORD.hasMoreMessages()) {
				action = SETTINGS.afterFirstMsg;
			}
			if (isNoAction(action) && !anyNewMessages) {
				action = SETTINGS.afterSavedMsg;
			}

			if (isNoAction(action)) {
				DISCORD.loadOlderMessages();
			}
			else if (action === CONSTANTS.AUTOSCROLL_ACTION_PAUSE || (action === CONSTANTS.AUTOSCROLL_ACTION_SWITCH && !DISCORD.selectNextTextChannel())) {
				GUI.setStatus("Reached End");
				STATE.setIsTracking(false);
			}
		}
	};

	let waitUntilSendingFinishedTimer = null;

	const onMessagesUpdated = async messages => {
		if (!STATE.isTracking() || delayedStopRequests > 0) {
			return;
		}

		if (isSending) {
			window.clearTimeout(waitUntilSendingFinishedTimer);

			waitUntilSendingFinishedTimer = window.setTimeout(() => {
				waitUntilSendingFinishedTimer = null;
				onMessagesUpdated(messages);
			}, 100);

			return;
		}

		const info = DISCORD.getSelectedChannel();

		if (!info) {
			GUI.setStatus("Error (Unknown Channel)");
			stopTrackingDelayed();
			return;
		}

		isSending = true;

		try {
			await STATE.addDiscordChannel(info.server, info.channel);
		} catch (e) {
			onError(e);
			return;
		}

		try {
			if (!messages.length) {
				isSending = false;
				onTrackingContinued(false);
			}
			else {
				const anyNewMessages = await STATE.addDiscordMessages(info.id, messages);
				onTrackingContinued(anyNewMessages);
			}
		} catch (e) {
			onError(e);
		}
	};

	DISCORD.setupMessageCallback(onMessagesUpdated);

	STATE.onTrackingStateChanged(enabled => {
		if (enabled) {
			const messages = DISCORD.getMessages();

			if (messages.length === 0) {
				stopTrackingDelayed(() => alert("Cannot see any messages."));
				return;
			}

			GUI.setStatus("Starting");
			hasJustStarted = true;
			// noinspection JSIgnoredPromiseFromCall
			onMessagesUpdated(messages);
		}
		else {
			isSending = false;
		}
	});

	GUI.showController();

	if (IS_FIRST_RUN) {
		GUI.showSettings();
	}
})();
