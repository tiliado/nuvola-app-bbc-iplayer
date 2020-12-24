/*
 * Copyright 2018 Andrew Stubbs <andrew.stubbs@gmail.com>
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

'use strict'

;(function (Nuvola) {
  // Create media player component
  const player = Nuvola.$object(Nuvola.MediaPlayer)

  // Handy aliases
  const PlaybackState = Nuvola.PlaybackState
  const PlayerAction = Nuvola.PlayerAction

  // Create new WebApp prototype
  const WebApp = Nuvola.$WebApp()

  // Initialization routines
  WebApp._onInitWebWorker = function (emitter) {
    Nuvola.WebApp._onInitWebWorker.call(this, emitter)

    const state = document.readyState
    if (state === 'interactive' || state === 'complete') {
      this._onPageReady()
    } else {
      document.addEventListener('DOMContentLoaded', this._onPageReady.bind(this))
    }
  }

  // Page is ready for magic
  WebApp._onPageReady = function () {
    // Connect handler for signal ActionActivated
    Nuvola.actions.connect('ActionActivated', this)

    // Prevent links opening in new windows or popups
    // Without this we can't integrate the radio player.
    const wrappedWindow = window.open
    window.open = function (url, name, specs, replace) {
      wrappedWindow(url, '_self', specs, replace)
    }

    // Start update routine
    this.update()
  }

  WebApp._get_media_frame = function () {
    const player = (
      // iplayer recordings
      document.querySelector('.playback-player iframe') ||
        // news pages
        document.querySelector('.media-player iframe') ||
        // radio recordings
        document.querySelector('.episode-playout iframe') ||
        // tv live
        document.querySelector('.player iframe') ||
        // radio live
        document.querySelector('.radio-main iframe') ||
        // sport
        document.querySelector('.smp iframe') ||
        // cbbc & cebeebies
        document.querySelector('.smp-embed iframe')
    )

    if (player) {
      return player.contentDocument
    }

    return null
  }

  WebApp._get_media = function () {
    try {
      const iframe = this._get_media_frame()
      let i
      let players = iframe.querySelectorAll('audio')
      for (i = 0; i < players.length; i++) {
        if (players[i].readyState > 0) return players[i]
      }
      players = iframe.querySelectorAll('video')
      for (i = 0; i < players.length; i++) {
        if (players[i].readyState > 0) return players[i]
      }
    } catch (e) {}
    return null
  }

  WebApp._get_play_button = function () {
    try {
      const iframe = this._get_media_frame()
      return iframe.querySelector('.p_playButton') ||
             iframe.querySelector('.p_button')
    } catch (e) {
      return null
    }
  }

  WebApp._get_skip_button = function () {
    try {
      const tvPlayer = this._get_media_frame()
      return tvPlayer.querySelector('.js-skip')
    } catch (e) {
      return null
    }
  }

  WebApp._is_tv_playing = function () {
    const media = this._get_media()
    return media && !media.paused
  }

  WebApp._is_radio_playing = function () {
    const radioControls = document.getElementById('controls')
    return (radioControls &&
            (radioControls.className === 'stoppable' ||
             radioControls.className === 'pauseable'))
  }

  WebApp._is_playing = function () {
    return this._is_tv_playing() || this._is_radio_playing()
  }

  // Extract data from the web page
  WebApp.update = function () {
    const track = {
      title: null,
      artist: null,
      album: null,
      artLocation: null,
      rating: null
    }

    let state = PlaybackState.UNKNOWN

    let elm = document.head.querySelector("[property='og:title']")
    if (elm) track.title = elm.content
    elm = document.head.querySelector("[property='og:image']")
    if (elm) track.artLocation = elm.content

    const media = this._get_media()
    const playButton = this._get_play_button()
    const skipButton = this._get_skip_button()

    if (media && !media.paused) {
      state = PlaybackState.PLAYING
    } else if (playButton) {
      state = PlaybackState.PAUSED
    }

    if (media) {
      if (media.duration < 36000 && media.duration > 0) {
        track.length = parseInt(media.duration) * 1000000
        player.setTrackPosition(media.currentTime * 1000000)
      }
      player.updateVolume(media.volume)

      // If there's media, but no title property, then look further
      if (!track.title) {
        try {
          // For Live TV the channel name is highlighted above the video
          elm = document.querySelector('.tvip-channels-list .selected img')
          track.title = elm.alt

          // Likewise the channel logo.
          track.artLocation = elm.src
        } catch (e) {}
      }
      if (!track.title) {
        try {
          // For Live Radio the channel name is the <audio> title.
          track.title = media.title

          // And the channel logo is at the top of the page
          elm = document.querySelector('.stn-logo img')
          track.artLocation = elm.src
        } catch (e) {}
      }
    }

    player.setTrack(track)
    player.setPlaybackState(state)
    player.setCanPlay(state !== PlaybackState.PLAYING && !!playButton)
    player.setCanPause(state === PlaybackState.PLAYING)
    player.setCanGoNext(!!skipButton)
    player.setCanSeek(media && media.seekable.length > 0)
    player.setCanChangeVolume(media)

    // Schedule the next update
    setTimeout(this.update.bind(this), 500)
  }

  // Handler of playback actions
  WebApp._onActionActivated = function (emitter, name, param) {
    let media
    let button

    switch (name) {
      case PlayerAction.TOGGLE_PLAY:
      case PlayerAction.PAUSE:
        media = this._get_media()
        if (media && !media.paused) {
          media.pause()
          break
        }
        // Fallthrough
      case PlayerAction.PLAY:
        // Use the button because media.play() doesn't work initially
        button = this._get_play_button()
        if (button) Nuvola.clickOnElement(button)
        break
      case PlayerAction.NEXT_SONG:
        button = this._get_skip_button()
        if (button) Nuvola.clickOnElement(button)
        break
      case PlayerAction.SEEK:
        media = this._get_media()
        if (media) media.currentTime = param / 1000000
        break
      case PlayerAction.CHANGE_VOLUME:
        media = this._get_media()
        if (media) media.volume = param
        break
    }
  }

  WebApp.start()
})(this) // function(Nuvola)

// vim: tabstop=4 shiftwidth=4 expandtab
