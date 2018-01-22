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

WebApp._get_media_frame = function()
{
    var player = document.querySelector(".playback-player iframe")
                 || document.querySelector(".media-player iframe")
                 || document.querySelector(".episode-playout iframe")
                 || document.querySelector("#player iframe")
                 || document.querySelector(".radioplayer iframe");
    
    if (player) {
        return player.contentDocument;
    }

    return null;
}

WebApp._get_media = function()
{
    try {
        var iframe = this._get_media_frame();
        return iframe.querySelector("audio")
               || iframe.querySelector("video");
    } catch(e) {
        return null;
    }
}

WebApp._get_play_button = function()
{
    try {
        var iframe = this._get_media_frame();
        return iframe.querySelector(".p_playButton")
               || iframe.querySelector(".p_button");
    } catch(e) {
        return null;
    }
}

WebApp._get_skip_button = function()
{
    try {
        var tv_player = this._get_media_frame();
        return tv_player.querySelector(".skip-button");
    } catch(e) {
        return null;
    }
}

WebApp._is_tv_playing = function()
{
    var media = this._get_media();
    return media && !media.paused;
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

    var elm = document.head.querySelector("[property='og:title']");
    if (elm)
        track["title"] = elm.content;
    elm = document.head.querySelector("[property='og:image']");
    if (elm)
        track["artLocation"] = elm.content;

    var media = this._get_media();
    var playButton = this._get_play_button();
    var skipButton = this._get_skip_button();

    if (media && !media.paused) {
	    state = PlaybackState.PLAYING;
    } else if (playButton) {
	    state = PlaybackState.PAUSED;
    }

    if (media) {
        if (media.duration < 36000 && media.duration > 0) {
            track.length = parseInt(media.duration) * 1000000;
            player.setTrackPosition(media.currentTime * 1000000);
        }
        player.updateVolume(media.volume);

        // If there's media, but no title property, then look further
        if (!track.title) {
            try {
                // For Live TV the channel name is highlighted below the video
                elm = document.querySelector(".channel.current");
                track["title"] = elm.querySelector("span").innerText;

                // Likewise the channel logo.
                var style = document.defaultView.getComputedStyle(elm, null);
                var url = style.getPropertyValue("background-image");
                track["artLocation"] = url.slice(5,-2);
            } catch(e) {}
        }
        if (!track.title) {
            try {
                // For Live Radio the channel name is the <audio> title.
                track["title"] = media.title;

                // And the channel logo is at the top of the page
                elm = document.querySelector(".stn-logo img");
                track["artLocation"] = elm.src;
            } catch(e) {}
        }
    }

    player.setTrack(track);
    player.setPlaybackState(state);
    player.setCanPlay(state != PlaybackState.PLAYING && !!playButton);
    player.setCanPause(state == PlaybackState.PLAYING);
    player.setCanGoNext(!!skipButton);
    player.setCanSeek(media && media.seekable.length > 0);
    player.setCanChangeVolume(media);

    // Schedule the next update
    setTimeout(this.update.bind(this), 500);
}

// Handler of playback actions
WebApp._onActionActivated = function(emitter, name, param)
{
    switch (name) {
        case PlayerAction.TOGGLE_PLAY:
        case PlayerAction.PAUSE:
            var media = this._get_media();
            if (media && !media.paused) {
                media.pause();
                break;
            }
            // Fallthrough
        case PlayerAction.PLAY:
            // Use the button because media.play() doesn't work initially
            var button = this._get_play_button();
            if (button)
                Nuvola.clickOnElement(button);
           break;
        case PlayerAction.NEXT_SONG:
            var button = this._get_skip_button();
            if (button)
                Nuvola.clickOnElement(button);
            break;
        case PlayerAction.SEEK:  // @API 4.5: undefined & ignored in Nuvola < 4.5
            var media = this._get_media();
            if (media)
                media.currentTime = param/1000000;
            break;
        case PlayerAction.CHANGE_VOLUME:  // @API 4.5: undefined & ignored in Nuvola < 4.5
            var media = this._get_media();
            if (media)
                media.volume = param;
            break;
    }
}

WebApp.start();

})(this);  // function(Nuvola)

// vim: tabstop=4 shiftwidth=4 expandtab
