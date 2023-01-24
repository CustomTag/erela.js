"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Node = void 0;
const tslib_1 = require("tslib");
/* eslint-disable no-case-declarations */
const ws_1 = tslib_1.__importDefault(require("ws"));
const undici_1 = require("undici");
const Utils_1 = require("./Utils");
function check(options) {
    if (!options)
        throw new TypeError("NodeOptions must not be empty.");
    if (typeof options.host !== "string" || !/.+/.test(options.host))
        throw new TypeError('Node option "host" must be present and be a non-empty string.');
    if (typeof options.port !== "undefined" && typeof options.port !== "number")
        throw new TypeError('Node option "port" must be a number.');
    if (typeof options.password !== "undefined" && (typeof options.password !== "string" || !/.+/.test(options.password)))
        throw new TypeError('Node option "password" must be a non-empty string.');
    if (typeof options.secure !== "undefined" && typeof options.secure !== "boolean")
        throw new TypeError('Node option "secure" must be a boolean.');
    if (typeof options.identifier !== "undefined" && typeof options.identifier !== "string")
        throw new TypeError('Node option "identifier" must be a non-empty string.');
    if (typeof options.retryAmount !== "undefined" && typeof options.retryAmount !== "number")
        throw new TypeError('Node option "retryAmount" must be a positive number.');
    if (typeof options.retryDelay !== "undefined" && typeof options.retryDelay !== "number")
        throw new TypeError('Node option "retryDelay" must be a positive number.');
    if (typeof options.requestTimeout !== "undefined" && typeof options.requestTimeout !== "number")
        throw new TypeError('Node option "requestTimeout" must be a positive number.');
    if (typeof options.poolOptions !== "undefined" && typeof options.poolOptions !== "object")
        throw new TypeError("Node option 'poolOptions' must be a correct undicie Http pool options-Object!");
    if (typeof options.regions !== "undefined" && !Array.isArray(options.regions))
        throw new TypeError("Node option 'regions' must an Array of Strings: string[]");
    if (typeof options.regions !== "undefined" && !options.regions.every(region => typeof region === "string"))
        throw new TypeError("Node option 'regions' must an Array of Strings: string[]");
    if (typeof options.version !== "undefined" && typeof options.version !== "string" && !["v2", "v3"].includes(options.version))
        throw new TypeError("Node Option 'version' must be either v2 or v3");
    if (typeof options.useVersionPath !== "undefined" && typeof options.useVersionPath !== "boolean")
        throw new TypeError("Node Option 'useVersionPath' must be a Boolean");
    return true;
}
class Node {
    options;
    /** The socket for the node. */
    socket = null;
    /** The HTTP pool used for rest calls. */
    http;
    /** The amount of rest calls the node has made. */
    calls = 0;
    /** The stats for the node. */
    stats;
    manager;
    version = "v3";
    initialized = false;
    sessionId = null;
    regions;
    static _manager;
    reconnectTimeout;
    reconnectAttempts = 1;
    useVersionPath = true;
    /** Returns if connected to the Node. */
    get connected() {
        if (!this.socket)
            return false;
        return this.socket.readyState === ws_1.default.OPEN;
    }
    /** Returns the address for this node. */
    get address() {
        return `${this.options.host}:${this.options.port}`;
    }
    /** @hidden */
    static init(manager) {
        this._manager = manager;
    }
    get poolAddress() {
        return `http${this.options.secure ? "s" : ""}://${this.address}`;
    }
    /**
     * Creates an instance of Node.
     * @param options
     */
    constructor(options) {
        this.options = options;
        if (!this.manager)
            this.manager = Utils_1.Structure.get("Node")._manager;
        if (!this.manager)
            throw new RangeError("Manager has not been initiated.");
        if (this.manager.nodes.has(options.identifier || options.host)) {
            return this.manager.nodes.get(options.identifier || options.host);
        }
        check(options);
        if (typeof this.options.version === "string")
            this.version = this.options.version;
        if (typeof this.options.useVersionPath === "boolean")
            this.useVersionPath = this.options.useVersionPath;
        this.options = {
            port: 2333,
            password: "youshallnotpass",
            secure: false,
            retryAmount: 5,
            retryDelay: 30e3,
            requestTimeout: 10e3,
            ...options,
        };
        if (this.options.secure) {
            this.options.port = 443;
        }
        this.http = new undici_1.Pool(this.poolAddress, this.options.poolOptions);
        this.regions = options.regions?.map?.(x => x?.toLowerCase?.()) || [];
        this.options.identifier = options.identifier || options.host;
        this.stats = {
            players: 0,
            playingPlayers: 0,
            uptime: 0,
            memory: {
                free: 0,
                used: 0,
                allocated: 0,
                reservable: 0,
            },
            cpu: {
                cores: 0,
                systemLoad: 0,
                lavalinkLoad: 0,
            },
            frameStats: {
                sent: 0,
                nulled: 0,
                deficit: 0,
            },
        };
        this.manager.nodes.set(this.options.identifier, this);
        this.manager.emit("nodeCreate", this);
    }
    /**
     * Gets all Players of a Node
     */
    async getPlayers() {
        if (!this.sessionId)
            throw new Error("The Lavalink-Node is either not ready, or not up to date!");
        const players = await this.makeRequest(`/sessions/${this.sessionId}/players`);
        if (!Array.isArray(players))
            return [];
        else
            return players;
    }
    /**
     * Gets specific Player Information
     */
    async getPlayer(guildId) {
        if (!this.sessionId)
            throw new Error("The Lavalink-Node is either not ready, or not up to date!");
        const res = await this.makeRequest(`/sessions/${this.sessionId}/players/${guildId}`);
        return res;
    }
    async updatePlayer(data) {
        if (!this.sessionId)
            throw new Error("The Lavalink-Node is either not ready, or not up to date!");
        const res = await this.makeRequest(`/sessions/${this.sessionId}/players/${data.guildId}`, (r) => {
            r.method = "PATCH";
            r.headers = { Authorization: this.options.password, 'Content-Type': 'application/json' };
            r.body = JSON.stringify(data.playerOptions);
            if (data.noReplace) {
                const url = new URL(`${this.poolAddress}${r.path}`);
                url.search = new URLSearchParams({ noReplace: data.noReplace?.toString() || 'false' }).toString();
                r.path = url.toString().replace(this.poolAddress, "");
            }
        });
        /*
          {
            guildId: '773668217163218944',
            track: {
              encoded: 'QAAA4wIAHU1vb25saWdodCBTaGFkb3cgKFJlbWFzdGVyZWQpAA1NaWtlIE9sZGZpZWxkAAAAAAADU5AACDcwMDkzODc2AAEAIWh0dHBzOi8vZGVlemVyLmNvbS90cmFjay83MDA5Mzg3NgAGZGVlemVyAAEAaWh0dHBzOi8vZS1jZG5zLWltYWdlcy5kemNkbi5uZXQvaW1hZ2VzL2NvdmVyL2UwN2IxODViZWNiZTBiNmFiMDE0YzM2NzQ4ZWZlMGMzLzEwMDB4MTAwMC0wMDAwMDAtODAtMC0wLmpwZwAAAAAAAA44',
              track: 'QAAA4wIAHU1vb25saWdodCBTaGFkb3cgKFJlbWFzdGVyZWQpAA1NaWtlIE9sZGZpZWxkAAAAAAADU5AACDcwMDkzODc2AAEAIWh0dHBzOi8vZGVlemVyLmNvbS90cmFjay83MDA5Mzg3NgAGZGVlemVyAAEAaWh0dHBzOi8vZS1jZG5zLWltYWdlcy5kemNkbi5uZXQvaW1hZ2VzL2NvdmVyL2UwN2IxODViZWNiZTBiNmFiMDE0YzM2NzQ4ZWZlMGMzLzEwMDB4MTAwMC0wMDAwMDAtODAtMC0wLmpwZwAAAAAAAA44',
              info: {
                identifier: '70093876',
                isSeekable: true,
                author: 'Mike Oldfield',
                length: 218000,
                isStream: false,
                position: 3640,
                title: 'Moonlight Shadow (Remastered)',
                uri: 'https://deezer.com/track/70093876',
                sourceName: 'deezer'
              }
            },
            volume: 100,
            paused: false,
            voice: {
              token: '793e7c82ef5f4b49',
              endpoint: 'frankfurt8457.discord.media:443',
              sessionId: '1dfe0c9a05946e0137698ece51d807b9',
              connected: true,
              ping: 0
            },
            filters: { volume: 3.5 }
          }
        */
        const player = this.manager.players.get(data.guildId);
        if (player) {
            if (typeof res.voice !== "undefined")
                player.voice = res.voice;
            if (typeof res.volume !== "undefined")
                player.volume = res.volume;
            if (typeof res.paused !== "undefined") {
                player.paused = res.paused;
                player.playing = !res.paused;
            }
            if (typeof res.filters !== "undefined")
                player.filters;
        }
        return res;
    }
    /**
     * Deletes a Lavalink Player (from Lavalink)
     * @param guildId
     */
    async destroyPlayer(guildId) {
        if (!this.sessionId) {
            console.warn("@deprecated - The Lavalink-Node is either not up to date (or not ready)! -- Using WEBSOCKET instead of REST");
            await this.send({
                op: "destroy",
                guildId: guildId
            });
            return;
        }
        await this.makeRequest(`/sessions/${this.sessionId}/players/${guildId}`, r => {
            r.method = "DELETE";
        });
        return;
    }
    /**
     * Updates the session with a resuming key and timeout
     * @param resumingKey
     * @param timeout
     */
    updateSession(resumingKey, timeout) {
        if (!this.sessionId)
            throw new Error("the Lavalink-Node is either not ready, or not up to date!");
        return this.makeRequest(`/sessions/${this.sessionId}`, r => {
            r.method = "PATCH";
            r.headers = { Authorization: this.options.password, 'Content-Type': 'application/json' };
            r.body = JSON.stringify({ resumingKey, timeout });
        });
    }
    /**
     * Gets the stats of this node
     */
    fetchStats() {
        return this.makeRequest(`/stats`);
    }
    /**
     * Get routplanner Info from Lavalink
     */
    getRoutePlannerStatus() {
        if (!this.sessionId)
            throw new Error("the Lavalink-Node is either not ready, or not up to date!");
        return this.makeRequest(`/routeplanner/status`);
    }
    /**
     * Release blacklisted IP address into pool of IPs
     * @param address IP address
     */
    async unmarkFailedAddress(address) {
        if (!this.sessionId)
            throw new Error("the Lavalink-Node is either not ready, or not up to date!");
        await this.makeRequest(`/routeplanner/free/address`, r => {
            r.method = "POST";
            r.headers = { Authorization: this.options.password, 'Content-Type': 'application/json' };
            r.body = JSON.stringify({ address });
        });
    }
    /** Connects to the Node. */
    connect() {
        if (this.connected)
            return;
        const headers = {
            Authorization: this.options.password,
            "Num-Shards": String(this.manager.options.shards),
            "User-Id": this.manager.options.clientId,
            "Client-Name": this.manager.options.clientName,
        };
        if (!this.initialized)
            this.initialized = true;
        this.socket = new ws_1.default(`ws${this.options.secure ? "s" : ""}://${this.address}`, { headers });
        this.socket.on("open", this.open.bind(this));
        this.socket.on("close", this.close.bind(this));
        this.socket.on("message", this.message.bind(this));
        this.socket.on("error", this.error.bind(this));
    }
    /** Destroys the Node and all players connected with it. */
    destroy() {
        if (!this.connected)
            return;
        const players = this.manager.players.filter(p => p.node == this);
        if (players.size)
            players.forEach(p => p.destroy());
        this.socket.close(1000, "destroy");
        this.socket.removeAllListeners();
        this.socket = null;
        this.reconnectAttempts = 1;
        clearTimeout(this.reconnectTimeout);
        this.manager.emit("nodeDestroy", this);
        this.manager.destroyNode(this.options.identifier);
    }
    /**
     * Makes an API call to the Node
     * @param endpoint The endpoint that we will make the call to
     * @param modify Used to modify the request before being sent
     * @returns The returned data
     */
    async makeRequest(endpoint, modify) {
        const options = {
            path: `${this.useVersionPath && this.version ? `/${this.version}` : ""}/${endpoint.replace(/^\//gm, "")}`,
            method: "GET",
            headers: {
                Authorization: this.options.password
            },
            headersTimeout: this.options.requestTimeout,
        };
        modify?.(options);
        const request = await this.http.request(options);
        this.calls++;
        if (options.method === "DELETE")
            return;
        return await request.body.json();
    }
    /**
     * Sends data to the Node.
     * @param data
     */
    send(data) {
        return new Promise((resolve, reject) => {
            if (!this.connected)
                return resolve(false);
            if (!data || !JSON.stringify(data).startsWith("{")) {
                return reject(false);
            }
            this.socket.send(JSON.stringify(data), (error) => {
                if (error)
                    reject(error);
                else
                    resolve(true);
            });
        });
    }
    reconnect() {
        this.reconnectTimeout = setTimeout(() => {
            if (this.reconnectAttempts >= this.options.retryAmount) {
                const error = new Error(`Unable to connect after ${this.options.retryAmount} attempts.`);
                this.manager.emit("nodeError", this, error);
                return this.destroy();
            }
            this.socket.removeAllListeners();
            this.socket = null;
            this.manager.emit("nodeReconnect", this);
            this.connect();
            this.reconnectAttempts++;
        }, this.options.retryDelay);
    }
    open() {
        if (this.reconnectTimeout)
            clearTimeout(this.reconnectTimeout);
        this.manager.emit("nodeConnect", this);
    }
    close(code, reason) {
        this.manager.emit("nodeDisconnect", this, { code, reason });
        if (code !== 1000 || reason !== "destroy")
            this.reconnect();
    }
    error(error) {
        if (!error)
            return;
        this.manager.emit("nodeError", this, error);
    }
    message(d) {
        if (Array.isArray(d))
            d = Buffer.concat(d);
        else if (d instanceof ArrayBuffer)
            d = Buffer.from(d);
        const payload = JSON.parse(d.toString());
        if (!payload.op)
            return;
        this.manager.emit("nodeRaw", payload);
        switch (payload.op) {
            case "stats":
                delete payload.op;
                this.stats = { ...payload };
                break;
            case "playerUpdate":
                const player = this.manager.players.get(payload.guildId);
                if (player) {
                    delete payload.op;
                    player.payload = Object.assign({}, payload);
                    if (player.get("updateInterval"))
                        clearInterval(player.get("updateInterval"));
                    player.position = payload.state.position || 0;
                    player.set("lastposition", player.position);
                    player.connected = payload.state.connected;
                    player.wsPing = payload.state.ping >= 0 ? payload.state.ping : player.wsPing <= 0 && player.connected ? null : player.wsPing || 0;
                    if (!player.createdTimeStamp && payload.state.time) {
                        player.createdTimeStamp = payload.state.time;
                        player.createdAt = new Date(player.createdTimeStamp);
                    }
                    let interValSelfCounter = (player.get("position_update_interval") || 250);
                    if (interValSelfCounter < 25)
                        interValSelfCounter = 25;
                    if (player.filterUpdated >= 1) {
                        player.filterUpdated++;
                        const maxMins = 8;
                        const currentDuration = player?.queue?.current?.duration || 0;
                        if (currentDuration <= maxMins * 60000) {
                            if (player.filterUpdated >= 3) {
                                player.filterUpdated = 0;
                                player.seek(player.position);
                            }
                        }
                        else {
                            player.filterUpdated = 0;
                        }
                    }
                    player.set("updateInterval", setInterval(() => {
                        player.position += interValSelfCounter;
                        player.set("lastposition", player.position);
                        if (player.filterUpdated >= 1) {
                            player.filterUpdated++;
                            const maxMins = 8;
                            const currentDuration = player?.queue?.current?.duration || 0;
                            if (currentDuration <= maxMins * 60000) {
                                if (player.filterUpdated >= 3) {
                                    player.filterUpdated = 0;
                                    player.seek(player.position);
                                }
                            }
                            else {
                                player.filterUpdated = 0;
                            }
                        }
                    }, interValSelfCounter));
                }
                break;
            case "event":
                this.handleEvent(payload);
                break;
            case "ready": // payload: { resumed: false, sessionId: 'ytva350aevn6n9n8', op: 'ready' }
                this.sessionId = payload.sessionId;
                // this.state = "CONNECTED";
                break;
            default:
                this.manager.emit("nodeError", this, new Error(`Unexpected op "${payload.op}" with data: ${JSON.stringify(payload)}`));
                return;
        }
    }
    handleEvent(payload) {
        if (!payload.guildId)
            return;
        const player = this.manager.players.get(payload.guildId);
        if (!player)
            return;
        const track = player.queue.current;
        const type = payload.type;
        if (payload.type === "TrackStartEvent") {
            this.trackStart(player, track, payload);
        }
        else if (payload.type === "TrackEndEvent") {
            this.trackEnd(player, track, payload);
        }
        else if (payload.type === "TrackStuckEvent") {
            this.trackStuck(player, track, payload);
        }
        else if (payload.type === "TrackExceptionEvent") {
            this.trackError(player, track, payload);
        }
        else if (payload.type === "WebSocketClosedEvent") {
            this.socketClosed(player, payload);
        }
        else {
            const error = new Error(`Node#event unknown event '${type}'.`);
            this.manager.emit("nodeError", this, error);
        }
    }
    trackStart(player, track, payload) {
        const finalOptions = player.get("finalOptions");
        if (finalOptions) {
            if (finalOptions.pause) {
                player.playing = !finalOptions.pause;
                player.paused = finalOptions.pause;
            }
            if (finalOptions.volume)
                player.volume = finalOptions.volume;
            if (finalOptions.startTime)
                player.position = finalOptions.startTime;
            player.set("finalOptions", undefined);
        }
        else {
            player.playing = true;
            player.paused = false;
        }
        this.manager.emit("trackStart", player, track, payload);
    }
    trackEnd(player, track, payload) {
        // If a track had an error while starting
        if (["LOAD_FAILED", "CLEAN_UP"].includes(payload.reason)) {
            player.queue.previous = player.queue.current;
            player.queue.current = player.queue.shift();
            if (!player.queue.current)
                return this.queueEnd(player, track, payload);
            this.manager.emit("trackEnd", player, track, payload);
            if (this.manager.options.autoPlay)
                player.play();
            return;
        }
        // If a track was forcibly played
        if (payload.reason === "REPLACED") {
            this.manager.emit("trackEnd", player, track, payload);
            return;
        }
        // If a track ended and is track repeating
        if (track && player.trackRepeat) {
            if (payload.reason === "STOPPED") {
                player.queue.previous = player.queue.current;
                player.queue.current = player.queue.shift();
            }
            if (!player.queue.current)
                return this.queueEnd(player, track, payload);
            this.manager.emit("trackEnd", player, track, payload);
            if (this.manager.options.autoPlay)
                player.play();
            return;
        }
        // If a track ended and is track repeating
        if (track && player.queueRepeat) {
            player.queue.previous = player.queue.current;
            if (payload.reason === "STOPPED") {
                player.queue.current = player.queue.shift();
                if (!player.queue.current)
                    return this.queueEnd(player, track, payload);
            }
            else {
                player.queue.add(player.queue.current);
                player.queue.current = player.queue.shift();
            }
            this.manager.emit("trackEnd", player, track, payload);
            if (this.manager.options.autoPlay)
                player.play();
            return;
        }
        // If there is another song in the queue
        if (player.queue.length) {
            player.queue.previous = player.queue.current;
            player.queue.current = player.queue.shift();
            this.manager.emit("trackEnd", player, track, payload);
            if (this.manager.options.autoPlay)
                player.play();
            return;
        }
        // If there are no songs in the queue
        if (!player.queue.length)
            return this.queueEnd(player, track, payload);
    }
    queueEnd(player, track, payload) {
        player.queue.current = null;
        player.playing = false;
        this.manager.emit("queueEnd", player, track, payload);
    }
    trackStuck(player, track, payload) {
        this.manager.emit("trackStuck", player, track, payload);
        player.stop();
    }
    trackError(player, track, payload) {
        this.manager.emit("trackError", player, track, payload);
        player.stop();
    }
    socketClosed(player, payload) {
        this.manager.emit("socketClosed", player, payload);
    }
}
exports.Node = Node;
