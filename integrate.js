/*
 * Copyright 2017 Andrew Stubbs <andrew.stubbs@gmail.com>
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met: 
 * 
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer. 
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution. 
 * 
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
 * ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

"use strict";

(function(Nuvola)
{

// Create media player component
var player = Nuvola.$object(Nuvola.MediaPlayer);

// Handy aliases
var PlaybackState = Nuvola.PlaybackState;
var PlayerAction = Nuvola.PlayerAction;

// Create new WebApp prototype
var WebApp = Nuvola.$WebApp();

// Initialization routines
WebApp._onInitWebWorker = function(emitter)
{
    Nuvola.WebApp._onInitWebWorker.call(this, emitter);

    var state = document.readyState;
    if (state === "interactive" || state === "complete")
        this._onPageReady();
    else
        document.addEventListener("DOMContentLoaded", this._onPageReady.bind(this));
}

// Page is ready for magic
WebApp._onPageReady = function()
{
    // Connect handler for signal ActionActivated
    Nuvola.actions.connect("ActionActivated", this);

    // Prevent links opening in new windows or popups
    // Without this we can't integrate the radio player.
    var wrapped_window = window.open;
    window.open = function(url, name, specs, replace) {
       wrapped_window(url, "_self", specs, replace);
    }

    // Start update routine
    this.update();
}

WebApp._message_added = false;

WebApp._get_html5_player = function()
{
    var player = document.getElementById("smphtml5iframeplayer")
                 || document.getElementById("smphtml5iframemedia-player-1");
    
    if (player) {
        return player.contentDocument;
    }
    else if (!this._message_added) {
        var flashplayer = document.getElementById("smp-flashSWFplayer")
                          || document.getElementById("smp-flashSWFmedia-player-1");
        var html5page = document.location.pathname == "/html5";
        if (flashplayer || html5page) {
            var messagediv = Nuvola.makeElement("div",
                {"style": "width: 100%; border: 1px solid black;"
                          + "background: #5294e2; color: white;"
                          + "font-size: 200%; font-weight: bold;"
                          + "padding: 10px; z-index: 10000;"}, "");
            if (html5page) {
                messagediv.appendChild(Nuvola.makeText("Please opt into HTML5 player below."));
                messagediv.appendChild(Nuvola.makeElement("p", {}, "The BBC may still use the Flash player for some content."));
            } else {
                messagediv.appendChild(Nuvola.makeText("Nuvola cannot integrate the Flash player. "));
                messagediv.appendChild(Nuvola.makeElement("a",
                    {"href": "/html5"},
                    "Opt in to the HTML5 player."));
            }
            document.body.insertBefore(messagediv, document.body.childNodes[0]);
            this._message_added = true;
        }
    }

    return null;
}

WebApp._get_play_button = function()
{
    try {
        var tv_player = this._get_html5_player();
        if (tv_player)
            return tv_player.getElementsByClassName("p_playButton")[0];

        // else radio player
        var radio_play = document.getElementById("btn-play");
        if (radio_play)
	    return radio_play;

        // else Listen button
        return document.getElementById("programmes-oap-listen");
    } catch(e) {
        return null;
    }
}

WebApp._get_pause_button = function()
{
    try {
        var tv_player = this._get_html5_player();
        if (tv_player)
            return tv_player.getElementsByClassName("p_pauseButton")[0];
        // else radio player
        return document.getElementById("btn-pause");
    } catch(e) {
        return null;
    }
}

WebApp._is_tv_playing = function()
{
    return this._get_html5_player() && this._get_pause_button();
}
 
WebApp._is_radio_playing = function()
{
    var radio_controls = document.getElementById("controls");
    return (radio_controls
            && (radio_controls.className == "stoppable"
	        || radio_controls.className == "pauseable"));
}

WebApp._is_playing = function()
{
    return this._is_tv_playing() || this._is_radio_playing();
}

// Extract data from the web page
WebApp.update = function()
{
    var track = {
        title: null,
        artist: null,
        album: null,
        artLocation: null,
        rating: null
    }

    var state = PlaybackState.UNKNOWN;

    try {
        var title = document.getElementsByTagName("title")[0].innerHTML || null;
        var pos = title.indexOf(" - ");
        if (pos != -1)
            track["title"] = title.substring(pos+3);

        var img = document.getElementById("player-outer").getElementsByTagName("img")[0];
        track["artLocation"] = img.src;
    } catch (e) {}

    var playButton = this._get_play_button();
    var pauseButton = this._get_pause_button();

    if (this._is_playing()) {
	    state = PlaybackState.PLAYING;
    } else if (playButton) {
	    state = PlaybackState.PAUSED;
    }

    player.setTrack(track);
    player.setPlaybackState(state);
    player.setCanPlay(state != PlaybackState.PLAYING && !!playButton);
    player.setCanPause(state != PlaybackState.PAUSED && !!pauseButton);

    // Schedule the next update
    setTimeout(this.update.bind(this), 500);
}

// Handler of playback actions
WebApp._onActionActivated = function(emitter, name, param)
{
    switch (name) {
    case PlayerAction.TOGGLE_PLAY:
	var button = this._is_playing() ? this._get_pause_button() : this._get_play_button();
	if (button)
	    Nuvola.clickOnElement(button);
	break;
    case PlayerAction.PLAY:
	var button = this._get_play_button();
	if (button)
	    Nuvola.clickOnElement(button);
	break;
    case PlayerAction.PAUSE:
	var button = this._get_pause_button();
	if (button)
	    Nuvola.clickOnElement(button);
	break;
    }
}

WebApp.start();

})(this);  // function(Nuvola)

// vim: tabstop=4 shiftwidth=4 expandtab
