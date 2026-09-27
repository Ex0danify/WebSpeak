<template>
  <div :class="['web-client', `language-${language}`]">
    <!-- Connection / welcome screen -->
    <section v-if="!voiceState.connected && !voiceState.reconnecting && !voiceState.reconnectFailed" class="join-page">
      <header class="join-header" role="banner">
        <div class="brand-lockup">
          <img class="brand-mark" src="/网站图标.jpg" alt="WebSpeak" />
          <div>
            <strong>{{ siteName }}</strong>
            <small>{{ t('browserWorkspace') }}</small>
          </div>
        </div>
        <div class="header-tools"><div class="header-note"><span class="tiny-dot"></span> {{ t('secureGateway') }}</div><Button as="a" size="sm" class="bg-fg text-surface-1 hover:bg-accent hover:text-accent-fg" :class="joinActionClass" href="https://github.com/EchoSixHIYA/WebSpeak-client-for-TeamSpeak" target="_blank" rel="noreferrer" :title="t('githubRepository')" :aria-label="t('githubRepository')"><Icon name="github" /><span class="max-[740px]:hidden">{{ t('githubRepository') }}</span></Button><Button variant="outline" size="sm" class="text-accent" :class="joinActionClass" :title="t('qqGroup')" :aria-label="t('qqGroup')" aria-haspopup="dialog" @click="qqModalOpen = true"><Icon name="qq" /><span class="max-[740px]:hidden">{{ t('qqGroup') }}</span></Button><Button as="a" variant="outline" size="sm" class="border-danger/30 bg-danger-soft text-danger hover:bg-danger-soft" :class="joinActionClass" href="https://space.bilibili.com/25414873" target="_blank" rel="noreferrer" :title="t('bilibiliProfile')" :aria-label="t('bilibiliProfile')"><span class="grid size-[18px] place-items-center rounded-[5px] bg-danger text-[11px] leading-none text-accent-fg">B</span><span class="max-[740px]:hidden">{{ t('bilibiliProfile') }}</span></Button><Chip variant="accent" class="h-[30px] max-[420px]:min-w-7 max-[420px]:justify-center max-[420px]:px-1 max-[420px]:text-[9px]" :title="`${t('currentVersion')}: v${appVersion}`" :aria-label="`${t('currentVersion')}: v${appVersion}`">v{{ appVersion }}</Chip><Button as="a" variant="outline" size="sm" class="text-accent" :class="joinActionClass" href="https://github.com/EchoSixHIYA/WebSpeak-client-for-TeamSpeak/blob/master/CHANGELOG.md" target="_blank" rel="noreferrer" :title="t('viewChangelog')" :aria-label="t('viewChangelog')"><Icon name="clock" size="sm" /><span class="max-[740px]:hidden">{{ t('viewChangelog') }}</span></Button><Button as="a" variant="outline" size="sm" class="text-accent" :class="joinActionClass" href="/admin" :title="t('adminConsole')" :aria-label="t('adminConsole')"><Icon name="settings" size="sm" /><span class="max-[740px]:hidden">{{ t('adminConsole') }}</span></Button><Button variant="ghost" size="sm" icon-only class="max-[420px]:hidden" :title="themeLabel" :aria-label="themeLabel" @click="cycleTheme"><Icon :name="themeIcon" /></Button><LanguageSwitcher v-model="language" class="join-language-switcher" :menu-label="t('languageMenu')" :close-label="t('close')" @change="persistLanguage" /></div>
      </header>

      <main class="join-content">
        <div class="join-copy">
          <div class="eyebrow"><span class="eyebrow-dot"></span> {{ t('privateAudio') }}</div>
          <h1>{{ t('joinLine1') }}<br /><em>{{ t('joinLine2') }}</em></h1>
          <p class="join-description">{{ localizedWelcomeText }}</p>
          <div class="promise-list">
            <div class="promise-item"><span class="promise-icon"><Icon name="waveform" :size="16" /></span><span><b>{{ t('highQuality') }}</b><small>{{ t('opusAudio') }}</small></span></div>
            <div class="promise-item"><span class="promise-icon mint"><Icon name="shield" :size="16" /></span><span><b>{{ t('secureJoin') }}</b><small>{{ t('inviteProtected') }}</small></span></div>
            <div class="promise-item"><span class="promise-icon sand"><Icon name="users" :size="16" /></span><span><b>{{ t('realtime') }}</b><small>{{ t('membersSync') }}</small></span></div>
          </div>
          <div v-if="visitorNumber !== null" class="visitor-count" role="status" aria-live="polite">
            <span class="visitor-count-orbit" aria-hidden="true"></span>
            <span class="visitor-count-icon"><Icon name="users" :size="15" /></span>
            <span class="visitor-count-label">{{ t('visitorCount', { count: visitorNumber }) }}</span>
            <span v-if="visitorTotal !== null" class="visitor-count-divider" aria-hidden="true"></span>
            <span v-if="visitorTotal !== null" class="visitor-count-total">{{ t('visitorTotal', { count: visitorTotal }) }}</span>
            <span class="visitor-count-spark" aria-hidden="true">✦</span>
          </div>
        </div>

        <div class="join-card">
          <h2>{{ t('welcomeBack') }}</h2>
          <p class="card-lead">{{ t('joinLead') }}</p>

          <div v-if="voiceState.error" class="notice error-notice"><span class="notice-symbol">!</span><span class="notice-content"><span>{{ localizedMessage(voiceState.error) }}</span><code v-if="voiceState.errorCode">{{ t('errorCode') }}: {{ visibleErrorCode(voiceState.errorCode) }}</code></span></div>
          <div v-if="browserError" class="notice warning-notice"><span class="notice-symbol">i</span><span>{{ localizedMessage(browserError) }}</span></div>
          <div v-if="!serverConfigLoading && !initialized" class="notice warning-notice"><span class="notice-symbol">i</span><span>{{ t('notConfigured') }} <a href="/admin">{{ t('configureNow') }}</a></span></div>
          <div v-if="!localPersistenceAvailable" class="notice warning-notice"><span class="notice-symbol">i</span><span>{{ t('localPersistenceUnavailable') }}</span></div>

          <form v-if="initialized" class="join-form" @submit.prevent="doConnect">
            <div v-if="accessMode === 'open'" class="field-grid target-fields">
              <Field id="server-address" :label="t('serverAddress')"><Input v-model="serverHost" autocomplete="url" :placeholder="t('serverAddressPlaceholder')"><template #leading><Icon name="server" /></template></Input></Field>
              <Field id="server-port" :label="t('serverPort')"><Input v-model="serverPort" inputmode="numeric" type="text" maxlength="5" :placeholder="t('serverPortPlaceholder')"><template #leading><Icon name="hash" /></template></Input></Field>
            </div>
            <div v-if="accelerationAvailable" class="acceleration-choice"><div class="acceleration-copy"><strong>{{ t('relayAcceleration') }}</strong><small>{{ t('relayAccelerationHint') }}</small></div><Select v-model="accelerationRelayId" class="min-w-[150px] max-w-[48%]" :aria-label="t('relayAcceleration')"><option value="">{{ t('directConnection') }}</option><option v-for="relay in accelerationRelays" :key="relay.id" :value="relay.id">{{ relay.name }}</option></Select></div>
            <div v-if="accessMode === 'open' && (favoriteServers.length || recentServers.length)" class="local-servers">
              <div v-if="favoriteServers.length" class="local-server-group"><span>{{ t('favoriteServers') }}</span><Button v-for="favorite in favoriteServers" :key="favorite.id" variant="outline" size="sm" class="text-accent" @click="selectLocalServer(favorite.address, favorite.nickname)">{{ favorite.label }}</Button></div>
              <div v-if="recentServers.length" class="local-server-group"><span>{{ t('recentServers') }}</span><Button v-for="recent in recentServers" :key="recent.id" variant="outline" size="sm" class="text-accent" @click="selectLocalServer(recent.address, recent.nickname)">{{ recent.address }}</Button></div>
            </div>
            <Button v-if="accessMode === 'open' && serverHost.trim()" variant="outline" size="sm" class="justify-self-start text-accent" @click="toggleFavorite">{{ isFavorite ? t('removeFavorite') : t('saveFavorite') }}</Button>

            <Field v-if="accessMode === 'open'" id="server-password" class="mt-1.5">
              <template #label>{{ t('serverPassword') }} <span class="font-normal text-fg-muted">{{ t('optional') }}</span></template>
              <Input v-model="serverPassword" type="password" autocomplete="off" :placeholder="t('optionalPassword')"><template #leading><Icon name="lock" /></template></Input>
            </Field>

            <Field id="nickname" :label="t('nickname')" class="mt-1.5">
              <Input v-model="nickname" autocomplete="nickname" maxlength="30" :placeholder="t('nicknamePlaceholder')" autofocus><template #leading><Icon name="users" /></template></Input>
            </Field>

            <Field id="channel" class="mt-1.5">
              <template #label>{{ t('targetChannel') }} <span class="font-normal text-fg-muted">{{ t('optional') }}</span></template>
              <Input v-model="channel" :placeholder="t('emptyDefault')" @keyup.enter="doConnect"><template #leading><Icon name="hash" /></template></Input>
            </Field>

            <details class="identity-options"><summary>{{ t('identityOptions') }}</summary><Checkbox v-model="rememberIdentity" class="remember-identity"><strong>{{ t('rememberIdentity') }}</strong><small>{{ t('rememberIdentityHint') }}</small></Checkbox></details><p v-if="rememberIdentity" class="identity-warning">{{ t('rememberIdentityConcurrentWarning') }}</p>

            <Button type="submit" size="lg" class="mt-2.5 w-full" :loading="voiceState.connecting" :disabled="!canJoin || serverConfigLoading || !identityReady || voiceState.connecting">
              <span>{{ voiceState.connecting ? t('connecting') : t('enterVoice') }}</span>
              <Icon v-if="!voiceState.connecting" name="chevron-right" />
            </Button>
            <Button v-if="voiceState.connecting" variant="ghost" size="sm" class="justify-self-center text-fg-muted hover:text-accent" @click="doDisconnect">{{ t('cancel') }}</Button>
          </form>
          <div class="join-meta"><Icon name="lock" :size="14" /> {{ t('connectionAuthorized') }}</div>
        </div>
      </main>

      <footer class="join-footer" role="contentinfo">
        <span>WebSpeak</span><span class="footer-separator">·</span><span>{{ t('teamSpeakClient') }}</span><span class="footer-spacer"></span><button type="button" class="clear-local-button" @click="clearBrowserData">{{ t('clearLocalData') }}</button><span class="footer-separator">·</span><span>{{ t('browserSupport') }}</span>
      </footer>

      <!-- QQ community modal -->
      <Dialog v-model="qqModalOpen" size="sm" :title="t('qqGroup')" :close-label="t('close')">
        <img class="mx-auto block max-h-[min(55vh,520px)] w-full max-w-[360px] rounded-lg object-contain" src="/qq-group-qr.jpg" :alt="t('qqGroupQrAlt')" />
        <p class="mb-2 mt-4 text-[13px] text-fg-muted">{{ t('qqJoinDirect') }}</p>
        <Button as="a" variant="outline" class="mb-2 h-auto w-full justify-start whitespace-normal break-all py-2.5 text-left font-normal text-accent" :href="qqJoinUrl" :aria-label="t('joinQqGroup')" target="_blank" rel="noreferrer">{{ qqJoinUrl }}</Button>
      </Dialog>
    </section>

    <!-- Connected application shell -->
    <div v-else :class="['app-shell', `mobile-view-${mobileSection}`]">
      <main class="workspace">
        <h1 v-if="!isMobileViewport || (mobileSection !== 'channels' && mobileSection !== 'more')" class="sr-only">{{ t('voiceSpace') }}</h1>
        <header class="workspace-header">
          <div class="breadcrumbs"><span class="mobile-brand">TeamSpeak <em>Web</em></span><span class="crumb-muted">{{ t('serverBreadcrumb') }}</span><Icon name="chevron-right" :size="14" /><strong>{{ currentChannelName }}</strong></div>
          <div class="workspace-actions">
            <div class="network-performance">
              <Button variant="outline" size="sm" class="gap-1.5 border-line bg-accent-soft px-[9px] text-accent hover:border-accent/35 hover:bg-accent-soft aria-expanded:border-accent/35 max-[740px]:size-9 max-[740px]:px-0 max-[391px]:size-8" :title="t('networkPerformance')" :aria-label="t('networkPerformance')" :aria-expanded="performancePanelOpen" @click.stop="togglePerformancePanel"><Icon name="activity" :size="16" /><span class="font-normal max-[740px]:hidden">{{ t('networkPerformance') }}</span><span v-if="performanceStats.ready && performanceStats.gatewayLatencyMs != null" class="font-mono text-[10px] font-normal text-fg-muted max-[740px]:hidden">{{ performanceStats.gatewayLatencyMs }} ms</span><span class="inline-flex max-[740px]:hidden"><Icon name="chevron-down" :size="13" /></span></Button>
              <section v-if="performancePanelOpen" class="performance-panel" role="dialog" :aria-label="t('networkPerformance')" @click.stop>
                <header><div><strong>{{ t('networkPerformance') }}</strong><small>{{ t('networkPerformanceHint') }}</small></div><button type="button" class="performance-refresh" :title="t('measureNow')" :disabled="performanceRunning" @click="refreshPerformanceProbe"><Icon name="refresh" :size="15" /></button></header>
                <div class="performance-route"><span>{{ t('browser') }}</span><i></i><span>{{ t('webSpeakGateway') }}</span><i></i><span>{{ t('teamSpeakServer') }}</span></div>
                <div class="performance-metrics"><article><small>{{ t('browserToGateway') }}</small><strong>{{ performanceStats.gatewayLatencyMs == null ? '—' : `${performanceStats.gatewayLatencyMs} ms` }}</strong><span>{{ t('packetLoss') }} {{ performanceStats.gatewayLossPercent == null ? '—' : `${performanceStats.gatewayLossPercent}%` }}</span></article><article><small>{{ t('gatewayToTeamSpeak') }}</small><strong>{{ performanceStats.teamSpeakLatencyMs == null ? '—' : `${performanceStats.teamSpeakLatencyMs} ms` }}</strong><span>{{ t('packetLoss') }} {{ performanceStats.teamSpeakLossPercent == null ? '—' : `${performanceStats.teamSpeakLossPercent}%` }}</span></article></div>
                <p class="performance-status">{{ performanceRunning ? t('measuring') : performanceStats.ready ? t('measureComplete') : t('measureUnavailable') }}</p>
                <section v-if="screenShareWebRtcStats.peers.length" class="webrtc-stats" aria-live="polite">
                  <header><div><strong>{{ t('webrtcStats') }}</strong><small>{{ t('webrtcStatsHint') }}</small></div></header>
                  <div v-if="screenShareWebRtcStats.capture" class="webrtc-stats-capture"><span>{{ t('screenShareCapture') }}</span><strong>{{ screenShareWebRtcStats.capture.width ?? '—' }} × {{ screenShareWebRtcStats.capture.height ?? '—' }}</strong><small>{{ screenShareWebRtcStats.capture.frameRate == null ? '—' : `${screenShareWebRtcStats.capture.frameRate.toFixed(1)} FPS` }}</small></div>
                  <div v-for="peer in screenShareWebRtcStats.peers" :key="peer.peerId" class="webrtc-stats-peer">
                    <div class="webrtc-stats-peer-heading"><strong>{{ peer.direction === 'outbound' ? t('screenShareSending') : t('screenShareReceiving') }}</strong><small>{{ peer.connectionState }} · {{ peer.candidateType ?? '—' }}</small></div>
                    <div class="webrtc-stats-values"><span>{{ peer.frameRate == null ? '—' : `${peer.frameRate.toFixed(1)} FPS` }}</span><span>{{ peer.bitrateKbps == null ? '—' : `${Math.round(peer.bitrateKbps)} kbps` }}</span><span>{{ peer.lossPercent == null ? '—' : `${peer.lossPercent.toFixed(2)}%` }} {{ t('packetLoss') }}</span><span>{{ peer.framesDropped == null ? '—' : peer.framesDropped }} {{ t('screenShareDroppedFrames') }}</span><span>{{ peer.jitterMs == null ? '—' : `${Math.round(peer.jitterMs)} ms` }} {{ t('screenShareJitter') }}</span><span>{{ peer.roundTripTimeMs == null ? '—' : `${Math.round(peer.roundTripTimeMs)} ms` }} {{ t('screenShareRtt') }}</span></div>
                    <small v-if="peer.codec || peer.qualityLimitationReason" class="webrtc-stats-detail">{{ peer.codec ?? '—' }}<template v-if="peer.qualityLimitationReason"> · {{ peer.qualityLimitationReason }}</template></small>
                  </div>
                </section>
              </section>
            </div>
            <Button variant="ghost" size="sm" icon-only :class="headerActionClass" :title="t('copyInvite')" :aria-label="t('copyInvite')" @click="doShare"><Icon name="share" /></Button>
            <Button v-if="isMobileViewport" variant="ghost" size="sm" icon-only :class="headerActionClass" :pressed="microphoneMuted" :title="microphoneMuted ? t('unmuteMic') : t('muteMic')" :aria-label="microphoneMuted ? t('microphoneMuted') : t('microphoneActive')" @click="toggleMicrophone"><Icon :name="microphoneMuted ? 'mic-off' : 'mic'" /></Button>
            <Button v-if="isMobileViewport" variant="ghost" size="sm" icon-only :class="headerActionClass" :title="t('audioSettings')" :aria-label="t('audioSettings')" @click="settingsOpen = true"><Icon name="settings" /></Button>
            <Button variant="ghost" size="sm" icon-only :class="`${headerActionClass} max-[740px]:hidden`" :title="themeLabel" :aria-label="themeLabel" @click="cycleTheme"><Icon :name="themeIcon" /></Button>
            <LanguageSwitcher v-model="language" class="workspace-language" :menu-label="t('languageMenu')" :close-label="t('close')" @change="persistLanguage" />
            <Button variant="ghost" size="sm" class="ml-2 gap-1.5 border-transparent bg-danger-soft text-sm font-bold text-danger hover:bg-danger hover:text-accent-fg max-[740px]:ml-0 max-[740px]:size-9 max-[740px]:px-0 max-[391px]:size-8" :title="t('exit')" :aria-label="t('exit')" @click="doDisconnect"><Icon name="door" :size="17" /><span class="max-[740px]:hidden">{{ t('exit') }}</span></Button>
          </div>
        </header>

        <Dialog v-model="screenShareSettingsOpen" size="sm" :title="t('screenShareSettings')" :description="t('screenShareSettingsHint')" :close-label="t('close')">
          <div class="grid gap-3.5">
            <Field :label="t('screenShareResolution')"><Select v-model="screenShareResolutionPreset"><option v-for="option in screenShareResolutionOptions" :key="option.value" :value="option.value">{{ t(option.label) }}</option></Select></Field>
            <Field :label="t('screenShareFrameRate')"><Select v-model="screenShareFrameRate"><option v-for="fps in screenShareFrameRateOptions" :key="fps" :value="fps">{{ fps }} FPS</option></Select></Field>
          </div>
          <p class="mb-1 mt-4 text-xs leading-4 text-fg-muted">{{ t('screenShareSettingsNote') }}</p>
          <template #footer>
            <Button variant="ghost" @click="screenShareSettingsOpen = false">{{ t('cancel') }}</Button>
            <Button @click="startScreenShareWithSettings"><Icon name="monitor" size="sm" />{{ t('startScreenShare') }}</Button>
          </template>
        </Dialog>

        <Banner
          v-if="voiceState.reconnecting || voiceState.reconnectFailed"
          :variant="voiceState.reconnectFailed ? 'danger' : 'warning'"
          :title="voiceState.reconnectFailed ? t('reconnectFailed') : t('connectionInterrupted')"
          class="mx-auto mt-3.5 w-[min(950px,calc(100%-64px))] max-[740px]:w-[calc(100%-30px)]"
        >
          {{ voiceState.reconnecting ? t('reconnectingAttempt', { attempt: voiceState.reconnectAttempt }) : localizedMessage(voiceState.error) }}
          <template #actions>
            <Button v-if="voiceState.reconnectFailed" size="sm" variant="outline" @click="reconnectNow">{{ t('reconnectNow') }}</Button>
            <Button size="sm" variant="ghost" @click="doDisconnect">{{ t('back') }}</Button>
          </template>
        </Banner>
        <Banner
          v-if="voiceState.audioNotice"
          variant="warning"
          :title="t('audioStatus')"
          class="mx-auto mt-3.5 w-[min(950px,calc(100%-64px))] max-[740px]:w-[calc(100%-30px)]"
        >
          {{ localizedAudioNotice(voiceState.audioNoticeCode, voiceState.audioNotice) }}
        </Banner>
        <div v-if="visiblePokes.length" class="fixed right-6 top-[82px] z-[35] flex w-[380px] max-w-[calc(100%-48px)] flex-col gap-2 min-[851px]:right-[calc(24px/var(--ui-scale))] min-[851px]:top-[calc(82px/var(--ui-scale))]">
          <Banner
            v-for="poke in visiblePokes"
            :key="poke.id"
            variant="warning"
            icon="bell"
            :title="`${poke.invokerName} ${t('pokedYou')}`"
            dismissible
            :dismiss-label="t('close')"
            class="shadow-lg"
            @dismiss="dismissPoke(poke.id)"
          >
            <template v-if="poke.message">{{ poke.message }}</template>
          </Banner>
        </div>

        <div class="workspace-scroll">
          <div class="workspace-content">
            <section :class="['voice-section', { 'mobile-section-hidden': mobileSection !== 'voice' }]">
              <div class="section-heading"><div><span class="section-kicker">{{ t('voiceActivity') }}</span><h2>{{ t('speakingNow') }}</h2></div><span class="section-counter">{{ t('onlineShort', { count: currentMembers.length }) }}</span></div>
              <div v-if="screenShareError" class="screen-share-inline-error" role="status"><Icon name="info" :size="15" /> <span>{{ screenShareErrorText }}</span></div>
              <section v-if="screenShareViewing" ref="screenSharePlayerEl" class="screen-share-player" role="region" :aria-label="t('screenShare')">
                <div class="screen-share-player-stage">
                  <video v-if="screenShareRemoteStream" :ref="setScreenVideoElement" class="screen-share-player-video" autoplay playsinline :muted="screenShareRemoteVolume === 0"></video>
                  <div v-else class="screen-share-player-placeholder"><span class="screen-share-player-placeholder-icon"><Icon name="monitor" :size="28" /></span><strong>{{ t('screenShareConnecting') }}</strong><span>{{ screenShareError ? screenShareErrorText : t('directP2POnly') }}</span></div>
                  <button type="button" class="screen-share-player-exit" :aria-label="t('screenShareExit')" :title="t('screenShareExit')" @click="leaveScreenShare"><Icon name="close" :size="22" /></button>
                  <div class="screen-share-player-viewers" :aria-label="t('screenShareViewers')">
                    <span class="screen-share-player-viewer-label"><Icon name="users" :size="14" /> {{ screenSharePlayerViewerCount }}</span>
                    <span class="screen-share-player-viewer-avatars"><span v-for="viewer in screenSharePlayerViewers" :key="viewer.peerId" class="screen-share-player-viewer-avatar" :style="screenShareViewerStyle(viewer)" :title="viewer.nickname">{{ viewer.avatar ? '' : avatarInitial(viewer.nickname) }}</span></span>
                  </div>
                  <span class="screen-share-player-live"><i></i>{{ t('watchingScreenShare') }}</span>
                  <span class="screen-share-player-source">{{ screenSharePlayerOwnerName }}</span>
                  <div class="screen-share-player-controls">
                    <div class="screen-share-player-volume" :title="t('screenShareVolume')"><Icon :name="screenShareRemoteVolume === 0 ? 'volume-off' : 'volume'" :size="18" /><Slider class="h-9 w-[102px] max-[740px]:h-9 max-[740px]:w-[70px]" :model-value="Math.round(screenShareRemoteVolume * 100)" :value-text="`${Math.round(screenShareRemoteVolume * 100)}%`" :aria-label="t('screenShareVolume')" @update:model-value="screenShareRemoteVolume = $event / 100" /></div>
                    <button type="button" :aria-label="screenShareFullscreen ? t('screenShareExitFullscreen') : t('screenShareFullscreen')" :title="screenShareFullscreen ? t('screenShareExitFullscreen') : t('screenShareFullscreen')" @click="toggleScreenShareFullscreen"><Icon :name="screenShareFullscreen ? 'fullscreen-exit' : 'fullscreen'" :size="19" /></button>
                  </div>
                </div>
              </section>
              <div v-if="currentMembers.length" class="voice-grid">
                <article v-for="member in roomMembers" :key="member.id" :class="['voice-card', { speaking: isSpeaking(member), self: member.isSelf }]">
                  <button v-if="isMobileViewport && !member.isSelf" type="button" class="voice-member-action" :aria-label="t('moreMemberOptions')" @click.stop="openMemberActions(member)"><Icon name="more" :size="17" /></button>
                  <div :class="['voice-avatar-wrap', { 'screen-share-avatar-wrap': screenShareStreamForMember(member) }]">
                    <div :class="['voice-avatar', { speaking: isSpeaking(member) }]" :style="avatarStyle(member.nickname, member.isSelf, member.avatar)">{{ member.avatar ? '' : avatarInitial(member.nickname) }}</div>
                    <span v-if="screenShareStreamForMember(member)" class="screen-share-live-indicator"><span class="screen-share-wave" aria-hidden="true"><i v-for="bar in screenShareIndicatorBars" :key="bar" :style="{ height: `${bar}px` }"></i></span><span>{{ t('sharingScreen') }}</span></span>
                    <button v-if="member.isSelf && (screenShareActive || screenShareStarting)" type="button" class="screen-share-stop-button" :aria-label="t('stopScreenShare')" :title="t('stopScreenShare')" @click.stop="stopScreenShare"><Icon name="close" :size="14" /></button>
                  </div>
                  <strong>{{ member.isSelf ? t('you') : member.nickname }}</strong><span>{{ isSpeaking(member) ? t('speaking') : member.isSelf ? t('connectedYou') : t('connected') }}</span>
                  <div v-if="member.isSelf || screenShareStreamForMember(member)" class="screen-share-card-actions">
                    <template v-if="member.isSelf && !screenShareActive && !screenShareStarting">
                      <div class="screen-share-start-actions">
                        <button type="button" class="screen-share-card-button" @click.stop="startScreenShareWithSettings"><Icon name="monitor" :size="13" /> {{ t('startScreenShare') }}</button>
                        <button type="button" class="screen-share-settings-button" :aria-label="t('screenShareSettings')" :aria-expanded="screenShareSettingsOpen" :title="t('screenShareSettings')" @click.stop="screenShareSettingsOpen = !screenShareSettingsOpen"><Icon name="settings" :size="13" /></button>
                      </div>
                    </template>
                    <button v-else-if="!member.isSelf" type="button" :class="['screen-share-card-button', { viewing: screenShareViewingStreamId === screenShareStreamForMember(member)?.streamId }]" @click.stop="toggleScreenShareForMember(member)"><Icon name="monitor" :size="13" /> {{ screenShareViewingStreamId === screenShareStreamForMember(member)?.streamId ? t('watching') : t('watchScreenShare') }}</button>
                  </div>
                </article>
                <article v-if="currentMembers.length > roomMembers.length" class="voice-card more-card"><div class="more-count">+{{ currentMembers.length - roomMembers.length }}</div><strong>{{ t('moreMembers') }}</strong><span>{{ t('viewLeft') }}</span></article>
              </div>
              <div v-else class="voice-empty"><span class="empty-icon"><Icon name="users" :size="20" /></span><strong>{{ t('waitingForMembers') }}</strong><span>{{ t('prepareMicrophone') }}</span></div>
              <div v-if="whisperTargetIds.size" class="whisper-strip">
                <div class="whisper-strip-copy"><strong><Icon name="users" :size="15" /> {{ t('whisperTargets') }}</strong><span>{{ whisperTargets.map((member) => member.nickname).join('、') }}</span></div>
                <button type="button" class="text-button" @click="clearWhisperTargets">{{ t('clearWhisperTargets') }}</button>
                <button type="button" class="whisper-ptt-button" :class="{ active: whisperPttActive || whisperActive }" :aria-pressed="whisperPttActive || whisperActive" @pointerdown.prevent="onWhisperPttDown" @pointerup.prevent="onWhisperPttUp" @pointercancel.prevent="onWhisperPttUp" @lostpointercapture="onWhisperPttUp"><Icon name="mic" :size="18" /> {{ whisperPttActive || whisperActive ? t('releaseWhisper') : t('whisperHoldToTalk') }}</button>
              </div>
              <div class="mobile-voice-controls">
                <button type="button" class="mobile-voice-toggle" :class="{ muted: microphoneMuted }" :aria-pressed="!microphoneMuted" :aria-label="microphoneMuted ? t('unmuteMic') : t('muteMic')" @click="toggleMicrophone"><Icon :name="microphoneMuted ? 'mic-off' : 'mic'" :size="18" /><span>{{ microphoneMuted ? t('unmuteMic') : t('muteMic') }}</span></button>
                <button type="button" class="mobile-voice-settings" :aria-label="t('audioSettings')" @click="settingsOpen = true"><Icon name="settings" :size="17" /><span>{{ t('audioSettings') }}</span></button>
              </div>
            </section>

            <section :class="['chat-panel', { 'mobile-section-hidden': mobileSection !== 'chat' }]">
              <div class="chat-tabs" role="tablist" :aria-label="t('chatTabs')">
                <button type="button" role="tab" :id="chatTabId('channel')" :aria-selected="chatTab === 'channel'" :aria-controls="chatPanelId" :class="{ active: chatTab === 'channel' }" @click="chatTab = 'channel'"><Icon name="hash" :size="15" /> {{ currentChannelName }}</button>
                <button type="button" role="tab" :id="chatTabId('server')" :aria-selected="chatTab === 'server'" :aria-controls="chatPanelId" :class="{ active: chatTab === 'server' }" @click="chatTab = 'server'"><Icon name="server" :size="15" /> {{ t('serverChat') }}</button>
                <button v-for="conversation in privateConversations" :key="conversation.id" type="button" role="tab" :id="chatTabId(`private-${conversation.id}`)" :aria-selected="chatTab === 'private' && privateClientId === conversation.id" :aria-controls="chatPanelId" :class="{ active: chatTab === 'private' && privateClientId === conversation.id }" @click="openPrivateChat(conversation.id)"><Icon name="message" :size="15" /> {{ conversation.name }}</button>
                <button type="button" role="tab" :id="chatTabId('events')" :aria-selected="chatTab === 'events'" :aria-controls="chatPanelId" :class="{ active: chatTab === 'events' }" @click="chatTab = 'events'"><Icon name="bell" :size="15" /> {{ t('eventLog') }}</button>
              </div>
              <div class="section-heading chat-heading"><div><span class="section-kicker">{{ chatTabLabel }}</span><h2><Icon :name="chatTab === 'server' ? 'server' : chatTab === 'events' ? 'bell' : chatTab === 'private' ? 'message' : 'hash'" :size="20" /> {{ chatTitle }}</h2></div><span class="section-counter">{{ chatTab === 'events' ? t('eventCount', { count: serverEvents.length }) : t('messageCount', { count: visibleChatMessages.length }) }}</span></div>
              <div ref="chatListEl" class="message-list" role="tabpanel" :id="chatPanelId" :aria-labelledby="activeChatTabId">
                <div v-if="chatTab === 'events'">
                  <article v-for="event in serverEvents" :key="event.id" class="event-row"><time>{{ formatTime(event.timestamp) }}</time><span>{{ eventText(event) }}</span></article>
                  <div v-if="!serverEvents.length" class="chat-empty"><div class="chat-empty-icon"><Icon name="bell" :size="24" /></div><strong>{{ t('noEvents') }}</strong><span>{{ t('noEventsLead') }}</span></div>
                </div>
                <div v-else-if="!visibleChatMessages.length" class="chat-empty"><div class="chat-empty-icon"><Icon name="message" :size="24" /></div><strong>{{ chatTab === 'private' ? t('privateChatStart') : t('chatStart') }}</strong><span>{{ chatTab === 'private' ? t('privateChatStartLead') : t('chatStartLead') }}</span></div>
                <template v-for="message in visibleChatMessages" :key="message.id">
                  <article v-if="chatTab !== 'events'" :class="['message-row', { mine: message.isSelf }]">
                <Avatar :name="message.invokerName" :src="messageAvatar(message) || undefined" size="md" surface="surface-1" class="text-[11px] text-accent-fg max-[740px]:size-9" :style="avatarStyle(message.invokerName, message.isSelf)" />
                  <div class="message-body"><div class="message-meta"><strong>{{ message.isSelf ? t('you') : message.invokerName }}</strong><time>{{ formatTime(message.timestamp) }}</time></div><div class="message-bubble">{{ message.message }}</div></div>
                  </article>
                </template>
              </div>
               <form v-if="chatTab !== 'events'" class="message-composer" @submit.prevent="submitMessage">
                 <Input v-model="messageDraft" maxlength="500" :placeholder="chatPlaceholder" :aria-label="t('send')" class="flex-1" input-class="h-9 border-0 bg-transparent px-0 text-[15px] max-[740px]:text-sm" />
                 <Button type="submit" icon-only class="size-[34px] shrink-0 rounded-[9px]" :disabled="!messageDraft.trim()" :title="t('send')" :aria-label="t('send')"><Icon name="send" :size="18" /></Button>
               </form>
             </section>
          </div>
        </div>

      </main>

      <div :class="['member-panel', { 'mobile-section-visible': mobileSection === 'channels' }]" :role="isMobileViewport && mobileSection === 'channels' ? 'main' : 'complementary'">
        <h1 v-if="isMobileViewport && mobileSection === 'channels'" class="sr-only">{{ t('voiceSpace') }}</h1>
        <div class="member-panel-heading"><div><span class="section-kicker">{{ t('people') }}</span><h2>{{ t('people') }}</h2></div><Button variant="outline" size="sm" :class="`gap-1.5 font-normal hover:border-warning/30 hover:bg-warning-soft hover:text-warning max-[740px]:h-[34px] ${away ? 'border-warning/30 bg-warning-soft text-warning' : 'border-line bg-surface-0 text-fg-muted'}`" @click="toggleAway"><span :class="['size-[7px] rounded-full', away ? 'bg-warning' : 'bg-success']" aria-hidden="true"></span>{{ away ? t('away') : t('available') }}</Button></div>
        <Input v-model="memberQuery" class="mt-[18px] shrink-0 max-[740px]:mt-3.5 [&>span]:h-8 max-[740px]:[&>span]:h-11" input-class="h-8 border-transparent bg-surface-2 text-[13.75px] max-[740px]:h-11 max-[740px]:text-[15px]" :placeholder="t('searchMembers')" :aria-label="t('searchMembers')"><template #leading><Icon name="search" :size="15" /></template></Input>
        <div class="member-tree">
          <section v-for="channelItem in filteredMemberChannels" :key="channelItem.id" :class="['member-channel-group', { current: currentChannel?.id === channelItem.id, 'drag-over': dragOverChannelId === channelItem.id }]" :data-member-channel-id="channelItem.id" :style="{ marginLeft: `${channelItem.depth * 10}px` }" @dragover="onChannelDragOver(channelItem, $event)" @dragleave="onChannelDragLeave(channelItem, $event)" @drop="onChannelDrop(channelItem, $event)" @pointermove="onMemberPointerMove($event)" @pointerup="onMemberPointerUp($event)" @pointercancel="onMemberPointerCancel($event)">
            <button class="member-channel-heading" :title="t('switchChannel')" @click="selectChannel(channelItem)">
              <Icon name="volume" :size="16" />
              <span>{{ channelItem.name }}</span>
              <small>{{ channelItem.members.length }}</small>
            </button>
            <div v-if="channelItem.members.length" class="member-list">
              <div v-for="member in channelItem.members" :key="`${channelItem.id}-${member.id}`" :class="['member-row group/row', { dragging: draggedMember?.id === member.id }]" :draggable="!member.isSelf" @dragstart="onMemberDragStart(member, $event)" @dragend="onMemberDragEnd" @pointerdown="onMemberPointerDown(member, $event)" @pointermove="onMemberPointerMove($event)" @pointerup="onMemberPointerUp($event)" @pointercancel="onMemberPointerCancel($event)" @contextmenu.prevent="openMemberMenu(member, $event)">
                <span class="relative shrink-0"><Avatar :name="member.nickname" :src="member.avatar || undefined" :speaking="isSpeaking(member)" surface="surface-1" class="size-[33px] text-[10px] text-accent-fg group-hover/row:[--avatar-gap:var(--color-surface-2)] group-focus-within/row:[--avatar-gap:var(--color-surface-2)] max-[740px]:size-10 max-[740px]:text-xs" :style="avatarStyle(member.nickname, member.isSelf)" /><span class="absolute -bottom-0.5 -right-0.5 size-[9px] rounded-full border-2 border-surface-1 bg-success max-[740px]:size-2.5" aria-hidden="true"></span></span>
                <div class="member-copy"><strong>{{ memberDisplayName(member) }}</strong><span>{{ member.away ? t('away') : isSpeaking(member) ? t('speaking') : member.isSelf ? t('yourDevice') : t('memberOnline') }}</span></div>
                <div class="member-flags" role="group" :aria-label="t('memberStates')"><span v-if="member.away" role="img" :title="t('away')" :aria-label="t('away')"><Icon name="clock" :size="13" /></span><span v-if="member.inputMuted" role="img" :title="t('inputMuted')" :aria-label="t('inputMuted')"><Icon name="mic-off" :size="13" /></span><span v-if="member.outputMuted" role="img" :title="t('outputMuted')" :aria-label="t('outputMuted')"><Icon name="volume-off" :size="13" /></span><span v-if="member.channelCommander" role="img" :title="t('channelCommander')" :aria-label="t('channelCommander')"><Icon name="shield" :size="13" /></span></div>
                <div class="member-volume" :data-member-id="member.id"><Icon :name="(volumes[member.id] ?? 1) === 0 ? 'volume-off' : 'volume'" :size="14" /><Slider class="w-[45px]" :min="0" :max="400" :model-value="Math.round((volumes[member.id] ?? 1) * 100)" :value-text="`${Math.round((volumes[member.id] ?? 1) * 100)}%`" :aria-label="t('memberVolume')" @update:model-value="setVolume(member.id, $event / 100)" /></div>
                <button v-if="isMobileViewport && !member.isSelf" type="button" class="member-action-button" :aria-label="t('moreMemberOptions')" @click.stop="openMemberActions(member)"><Icon name="more" :size="18" /></button>
              </div>
            </div>
            <div v-else class="channel-no-members">{{ t('noMembersInChannel') }}</div>
          </section>
        </div>
        <div v-if="!filteredMemberChannels.length" class="member-empty">{{ t('noMatchingMembers') }}</div>
        <div v-if="!isMobileViewport" class="desktop-audio-dock" role="toolbar" :aria-label="t('desktopAudioControls')">
          <div class="desktop-audio-dock-copy"><strong>{{ t('desktopAudioControls') }}</strong><span>{{ accompanimentActive ? t('accompanimentActive') : t('desktopAudioHint') }}</span></div>
          <div class="desktop-audio-dock-actions">
            <div class="dock-hover-control">
              <Button variant="ghost" size="sm" icon-only class="size-[34px] text-fg-muted hover:bg-accent-soft hover:text-accent" :title="microphoneMuted ? t('unmuteMic') : t('muteMic')" :aria-label="microphoneMuted ? t('microphoneMuted') : t('microphoneActive')" :pressed="microphoneMuted" aria-haspopup="dialog" @click="toggleMicrophone"><Icon :name="microphoneMuted ? 'mic-off' : 'mic'" /></Button>
              <div class="dock-hover-panel dock-microphone-panel" role="dialog" :aria-label="t('microphone')">
                <div class="flex items-center justify-between gap-3"><span class="min-w-0 truncate text-[10px] text-fg-muted">{{ t('inputVolume') }}</span><strong class="shrink-0 text-[11px] text-accent">{{ Math.round(inputVolume * 100) }}%</strong></div>
                <Slider :model-value="Math.round(inputVolume * 100)" :value-text="`${Math.round(inputVolume * 100)}%`" :aria-label="t('inputVolume')" class="mt-1.5" @update:model-value="setInputVolume($event / 100)" />
                <Separator class="my-3" />
                <label class="flex cursor-pointer items-center justify-between gap-3"><strong class="min-w-0 text-[11px] text-fg">{{ t('noiseSuppression') }}</strong><Switch :model-value="noiseSuppressionEnabled" :aria-label="t('noiseSuppression')" @update:model-value="setNoiseSuppressionEnabled" /></label>
              </div>
            </div>
            <div class="dock-hover-control">
              <Button variant="ghost" size="sm" icon-only class="size-[34px] text-fg-muted hover:bg-accent-soft hover:text-accent" :title="outputMuted ? t('unmuteOutput') : t('muteOutput')" :aria-label="outputMuted ? t('unmuteOutput') : t('muteOutput')" :pressed="outputMuted" aria-haspopup="dialog" @click="toggleOutputMute"><Icon :name="outputMuted ? 'volume-off' : 'volume'" /></Button>
              <div class="dock-hover-panel dock-output-panel" role="dialog" :aria-label="t('overallVolume')">
                <div class="flex items-center justify-between gap-3"><span class="min-w-0 truncate text-[10px] text-fg-muted">{{ t('overallVolume') }}</span><strong class="shrink-0 text-[11px] text-accent">{{ Math.round(outputVolume * 100) }}%</strong></div>
                <Slider :model-value="Math.round(outputVolume * 100)" :value-text="`${Math.round(outputVolume * 100)}%`" :aria-label="t('overallVolume')" class="mt-1.5" @update:model-value="setOutputVolume($event / 100)" />
              </div>
            </div>
            <Tooltip :text="t('audioSettings')"><Button variant="ghost" size="sm" icon-only class="size-[34px] text-fg-muted hover:bg-accent-soft hover:text-accent" :aria-label="t('audioSettings')" @click="settingsOpen = true"><Icon name="settings" /></Button></Tooltip>
            <Tooltip :text="accompanimentActive ? t('stopAccompaniment') : t('startAccompaniment')"><Button variant="ghost" size="sm" icon-only class="size-[34px] text-fg-muted hover:bg-accent-soft hover:text-accent aria-pressed:border-accent/40 aria-pressed:bg-accent-soft aria-pressed:text-accent" :aria-label="accompanimentActive ? t('stopAccompaniment') : t('startAccompaniment')" :pressed="accompanimentActive" @click="toggleAccompaniment"><Icon name="music" /></Button></Tooltip>
          </div>
        </div>
      </div>

      <section v-if="mobileSection === 'more'" class="mobile-more-panel" role="main">
        <h1 class="sr-only">{{ t('voiceSpace') }}</h1>
        <span class="section-kicker">{{ t('mobileMore') }}</span>
        <h2>{{ t('mobileMore') }}</h2>
        <Button variant="outline" :class="microphoneMuted ? `${moreActionClass} text-danger` : moreActionClass" @click="toggleMicrophone"><Icon :name="microphoneMuted ? 'mic-off' : 'mic'" :size="18" /> {{ microphoneMuted ? t('unmuteMic') : t('muteMic') }}</Button>
        <Button variant="outline" :class="moreActionClass" @click="settingsOpen = true"><Icon name="settings" :size="18" /> {{ t('audioSettings') }}</Button>
        <Button variant="outline" :class="moreActionClass" @click="cycleTheme"><Icon :name="themeIcon" :size="18" /> {{ themeLabel }}</Button>
        <div class="language-menu-row"><Icon name="globe" :size="18" /><span>{{ t('languageMenu') }}</span><LanguageSwitcher v-model="language" :menu-label="t('languageMenu')" :close-label="t('close')" @change="persistLanguage" /></div>
        <Button variant="outline" :class="`${moreActionClass} text-danger`" @click="doDisconnect"><Icon name="door" :size="18" /> {{ t('exit') }}</Button>
      </section>

      <nav class="mobile-nav" :aria-label="t('mobileNavigation')">
        <Tabs v-model="mobileSection" variant="segmented" class="flex flex-1">
          <TabList fill :aria-label="t('mobileNavigation')" class="grid flex-1 grid-cols-4 gap-0.5 rounded-none bg-transparent p-0">
            <Tab value="channels" class="h-auto min-h-[52px] max-[740px]:h-auto flex-col justify-start pt-[5.5px] gap-[12px] rounded-lg px-1 text-xs font-normal aria-selected:bg-accent-soft aria-selected:font-bold aria-selected:text-accent aria-selected:shadow-none"><Icon name="volume" :size="18" /><span class="max-w-full truncate">{{ t('mobileChannels') }}</span></Tab>
            <Tab value="chat" class="h-auto min-h-[52px] max-[740px]:h-auto flex-col justify-start pt-[5.5px] gap-[12px] rounded-lg px-1 text-xs font-normal aria-selected:bg-accent-soft aria-selected:font-bold aria-selected:text-accent aria-selected:shadow-none"><Icon name="message" :size="18" /><span class="max-w-full truncate">{{ t('mobileChat') }}</span></Tab>
            <Tab value="voice" class="h-auto min-h-[52px] max-[740px]:h-auto flex-col justify-start pt-[5.5px] gap-[12px] rounded-lg px-1 text-xs font-normal aria-selected:bg-accent-soft aria-selected:font-bold aria-selected:text-accent aria-selected:shadow-none"><Icon name="mic" :size="18" /><span class="max-w-full truncate">{{ t('mobileVoice') }}</span></Tab>
            <Tab value="more" class="h-auto min-h-[52px] max-[740px]:h-auto flex-col justify-start pt-[5.5px] gap-[12px] rounded-lg px-1 text-xs font-normal aria-selected:bg-accent-soft aria-selected:font-bold aria-selected:text-accent aria-selected:shadow-none"><Icon name="more" :size="18" /><span class="max-w-full truncate">{{ t('mobileMore') }}</span></Tab>
          </TabList>
        </Tabs>
      </nav>
    </div>

    <Menu :open="Boolean(memberMenu)" :label="memberMenu?.member.nickname" :close-label="t('close')" @update:open="(value) => { if (!value) memberMenu = null; }" @close-auto-focus="onMemberMenuCloseAutoFocus">
      <template #trigger><span class="fixed size-0" :style="memberMenuStyle" aria-hidden="true"></span></template>
      <template v-if="memberMenu">
        <MenuLabel class="normal-case tracking-normal text-fg">{{ memberMenu.member.nickname }}</MenuLabel>
        <MenuSlider :model-value="Math.round((volumes[memberMenu.member.id] ?? 1) * 100)" :label="t('memberVolume')" :min="0" :max="400" :key-step="5" :value-text="`${Math.round((volumes[memberMenu.member.id] ?? 1) * 100)}%`" @update:model-value="setVolume(memberMenu.member.id, $event / 100)" />
        <MenuSeparator />
        <MenuItem @select="openPrivateChat(memberMenu.member.id)"><Icon name="message" :size="15" />{{ t('privateMessage') }}</MenuItem>
        <MenuItem @select="pokeMember(memberMenu.member)"><Icon name="bell" :size="15" />{{ t('poke') }}</MenuItem>
        <MenuItem @select="toggleWhisperTarget(memberMenu.member)"><Icon name="mic" :size="15" />{{ whisperTargetIds.has(memberMenu.member.id) ? t('removeWhisperTarget') : t('setWhisperTarget') }}</MenuItem>
        <MenuItem @select="copyMemberName(memberMenu.member)"><Icon name="copy" :size="15" />{{ t('copyNickname') }}</MenuItem>
        <MenuSub>
          <template #icon><Icon name="hash" :size="15" /></template>
          <template #label>{{ t('moveMemberMenu') }}</template>
          <MenuItem v-if="memberMoveMenuCurrentChannel" :disabled="memberMoveMenuCurrentSameChannel" @select="moveMemberDirect(memberMenu.member, memberMoveMenuCurrentChannel.id)"><Icon name="users" :size="15" /><span class="min-w-0 flex-1 truncate">{{ t('moveMemberMyChannel') }}</span><small class="ml-auto max-w-[45%] shrink-0 truncate pl-2 text-[10px] text-fg-muted">{{ memberMoveMenuCurrentChannel.name }}</small></MenuItem>
          <MenuItem v-for="targetChannel in memberMoveMenuOtherChannels" :key="targetChannel.id" @select="moveMemberDirect(memberMenu.member, targetChannel.id)"><Icon name="volume" :size="15" /><span class="min-w-0 flex-1 truncate">{{ targetChannel.name }}</span></MenuItem>
          <p v-if="!memberMoveMenuCurrentChannel && !memberMoveMenuOtherChannels.length" class="m-0 px-2.5 py-2 text-xs text-fg-muted">{{ t('moveMemberNoChannels') }}</p>
        </MenuSub>
      </template>
    </Menu>

    <!-- Protected channel password modal -->
    <PasswordDialog
      :open="channelPasswordDialog.open"
      v-model:password="channelPasswordDialog.password"
      :title="t('channelPasswordTitle')"
      :lead="t('channelPasswordLead')"
      :label="t('channelPasswordPrompt')"
      :placeholder="t('channelPasswordPlaceholder')"
      :submit-label="t('channelPasswordSubmit')"
      :cancel-label="t('channelPasswordCancel')"
      :close-label="t('close')"
      :error="channelPasswordDialog.error"
      :submitting="channelPasswordDialog.submitting"
      @submit="submitChannelPassword"
      @cancel="cancelChannelPassword"
    />

    <!-- TeamSpeak server password modal -->
    <PasswordDialog
      :open="serverPasswordDialog.open"
      v-model:password="serverPasswordDialog.password"
      :title="t('serverPasswordTitle')"
      :lead="serverPasswordDialog.errorCode === 'INVALID_SERVER_PASSWORD' ? t('serverPasswordInvalidLead') : t('serverPasswordRequiredLead')"
      :label="t('serverPasswordPrompt')"
      :placeholder="t('serverPasswordRetryPlaceholder')"
      :submit-label="t('serverPasswordRetry')"
      :cancel-label="t('channelPasswordCancel')"
      :close-label="t('close')"
      @submit="submitServerPassword"
      @cancel="cancelServerPassword"
    />

    <!-- Audio settings modal -->
      <Dialog v-model="settingsOpen" class="max-w-[47.5rem]" :title="t('audioConfiguration')" :close-label="t('close')">
        <div class="settings-body">
          <section class="settings-section">
            <h3><Icon name="mic" :size="20" /> {{ t('inputDevice') }}</h3>
            <Field :label="t('microphone')" :error="audioSettingsError ? localizedMessage(audioSettingsError) : undefined" class="mb-5">
              <Select :model-value="selectedInputDeviceId" :disabled="!inputDevices.length" @update:model-value="onInputDeviceChange">
                <option value="">{{ t('defaultMicrophone') }}</option>
                <option v-for="(device, index) in inputDevices" :key="device.deviceId || `microphone-${index}`" :value="device.deviceId">{{ device.label || t('microphoneNumber', { index: index + 1 }) }}</option>
              </Select>
            </Field>
            <div class="mb-4 flex items-center justify-between gap-3 text-xs text-fg-muted">
              <span>{{ t('permission') }}</span>
              <Chip :variant="audioPermission === 'granted' ? 'success' : audioPermission === 'denied' ? 'danger' : 'neutral'">{{ audioPermission === 'granted' ? t('permissionGranted') : audioPermission === 'denied' ? t('permissionDenied') : t('permissionUnknown') }}</Chip>
            </div>
            <div class="mb-[18px] flex items-center justify-between gap-4 rounded-lg border border-line bg-surface-2 p-3 max-[740px]:flex-col max-[740px]:items-stretch max-[740px]:gap-2.5">
              <div class="min-w-0">
                <Label class="mb-1 block">{{ t('microphoneState') }}</Label>
                <Hint class="max-w-[390px] max-[740px]:max-w-none">{{ microphoneMuted ? t('microphoneMutedHint') : t('microphoneActiveHint') }}</Hint>
              </div>
              <Button :pressed="microphoneMuted" class="shrink-0 max-[740px]:h-11 max-[740px]:w-full" @click="toggleMicrophone"><Icon :name="microphoneMuted ? 'mic-off' : 'mic'" :size="16" /> {{ microphoneMuted ? t('unmuteMic') : t('muteMic') }}</Button>
            </div>
            <label v-if="isMobileViewport" class="mb-[18px] flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-line bg-surface-2 p-3">
              <span class="min-w-0">
                <strong class="block text-[13px] font-medium text-fg">{{ t('noiseSuppression') }}</strong>
                <small class="mt-0.5 block text-xs leading-4 text-fg-muted">{{ t('noiseSuppressionHint') }}</small>
              </span>
              <Switch :model-value="noiseSuppressionEnabled" :aria-label="t('noiseSuppression')" @update:model-value="setNoiseSuppressionEnabled" />
            </label>
            <template v-if="isMobileViewport">
              <div class="flex items-center justify-between gap-3"><Label for="input-volume">{{ t('inputVolume') }}</Label><strong class="text-[12.5px] text-accent">{{ Math.round(inputVolume * 100) }}%</strong></div>
              <Slider id="input-volume" :model-value="Math.round(inputVolume * 100)" :value-text="`${Math.round(inputVolume * 100)}%`" class="mb-2" @update:model-value="setInputVolume($event / 100)" />
            </template>
            <div class="flex items-center justify-between gap-3"><Label for="vox-threshold">{{ t('voxThreshold') }}</Label><strong class="text-[12.5px] text-accent">{{ (voxThreshold * 100).toFixed(1) }}%</strong></div>
            <Slider id="vox-threshold" :model-value="Math.round(voxThreshold * 1000)" :min="1" :max="80" :value-text="`${(voxThreshold * 100).toFixed(1)}%`" class="mb-2" @update:model-value="setVoxThreshold($event / 1000)" />
            <div class="mt-2.5 flex items-center justify-between gap-3 text-xs text-fg-muted"><span>{{ t('micLevel') }}</span><strong class="font-semibold text-fg">{{ Math.round(micLevel * 100) }}%</strong></div>
            <Meter ref="micLevelMeter" class="mb-[17px] mt-[7px]" />
            <div class="mic-test">
              <div class="mic-test-header"><strong>{{ t('microphoneTest') }}</strong><Button variant="outline" size="sm" @click="toggleMicTest">{{ microphoneTestActive ? t('stopTest') : t('startTest') }}</Button></div>
              <div class="meter"><i v-for="index in 24" :key="index" :class="{ active: microphoneTestActive && index <= micMeterBars }" :style="{ height: `${meterBarHeight(index) }px` }"></i></div>
              <div class="meter-labels"><span>{{ t('silence') }}</span><span>{{ t('optimal') }}</span><span>{{ t('loud') }}</span></div>
              <Hint class="mt-2.5">{{ t('localMicTestHint') }}</Hint>
              <audio v-if="testAudioUrl" class="test-audio" :src="testAudioUrl" controls :aria-label="t('microphoneTest')"></audio>
            </div>
          </section>
          <Separator class="mx-auto my-8 max-w-[620px]" />
          <section class="settings-section">
            <h3><Icon name="volume" :size="20" /> {{ t('outputVolume') }}</h3>
            <Field v-if="outputDeviceSupported" :label="t('outputDevice')" class="mb-5">
              <Select :model-value="selectedOutputDeviceId" :disabled="!outputDevices.length" @update:model-value="onOutputDeviceChange">
                <option value="">{{ t('defaultOutput') }}</option>
                <option v-for="(device, index) in outputDevices" :key="device.deviceId || `speaker-${index}`" :value="device.deviceId">{{ device.label || t('speakerNumber', { index: index + 1 }) }}</option>
              </Select>
            </Field>
            <p v-else class="mb-5 flex items-start gap-2 rounded-md bg-surface-0 p-3 text-[12.5px] leading-normal text-fg-muted"><Icon name="info" :size="16" class="shrink-0 text-accent" /><span>{{ t('outputDeviceUnsupported') }}</span></p>
            <template v-if="isMobileViewport">
              <div class="flex items-center justify-between gap-3"><Label for="output-volume">{{ t('speakers') }}</Label><strong class="text-[12.5px] text-accent">{{ Math.round(outputVolume * 100) }}%</strong></div>
              <Slider id="output-volume" :model-value="Math.round(outputVolume * 100)" :value-text="`${Math.round(outputVolume * 100)}%`" class="mb-2" @update:model-value="setOutputVolume($event / 100)" />
            </template>
            <div class="flex items-center justify-between gap-3"><Label for="notification-volume">{{ t('notificationVolume') }}</Label><strong class="text-[12.5px] text-accent">{{ Math.round(notificationVolume * 100) }}%</strong></div>
            <Slider id="notification-volume" :model-value="Math.round(notificationVolume * 100)" :value-text="`${Math.round(notificationVolume * 100)}%`" class="mb-2" @update:model-value="setNotificationVolume($event / 100)" />
            <div class="mt-2.5 flex items-center justify-between gap-3 text-xs text-fg-muted"><span>{{ t('audioStatus') }}</span><Chip :variant="audioStatus.variant">{{ audioStatus.label }}</Chip></div>
            <Hint v-if="voiceState.microphoneError" invalid class="mt-2.5">{{ localizedMessage(voiceState.microphoneError) }}</Hint>
            <p class="mt-2.5 flex items-start gap-2 rounded-md bg-surface-0 p-3 text-[12.5px] leading-normal text-fg-muted"><Icon name="shield" :size="16" class="shrink-0 text-accent" /><span>{{ t('audioPrivacy') }}</span></p>
          </section>
        </div>
        <template #footer><Button @click="settingsOpen = false">{{ t('done') }}</Button></template>
      </Dialog>

    <Toaster :label="t('notifications')" :dismiss-label="t('close')" class="p-6 min-[851px]:p-[calc(24px/var(--ui-scale))]" />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { Avatar } from "@/components/ui/avatar";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Chip } from "@/components/ui/chip";
import { Dialog } from "@/components/ui/dialog";
import { Field, Hint, Label } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Menu, MenuItem, MenuLabel, MenuSeparator, MenuSlider, MenuSub } from "@/components/ui/menu";
import { Meter } from "@/components/ui/meter";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tab, TabList, Tabs } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { toast as raiseToast } from "@/lib/use-toast";
import LanguageSwitcher from "../components/LanguageSwitcher.vue";
import PasswordDialog from "../components/PasswordDialog.vue";
import { useVoiceWebSocket, type ChannelInfo, type ChannelMember, type ChatMessage, type LatencyProbeResult, type ScreenShareOutputSettings, type ScreenShareStream, type ServerEvent } from "../composables/useVoiceWebSocket.js";
import { clearLocalData as clearStoredLocalData, isLocalPersistenceAvailable, listFavorites, listRecentServers, loadLocalPreferences, loadStoredIdentity, recordRecentServer, removeFavorite, removeStoredIdentity, saveFavorite, saveLocalPreferences, saveStoredIdentity, type FavoriteServer, type RecentServer } from "../services/local-persistence.js";
import { applyTheme, getStoredTheme, isDarkTheme, nextTheme, saveTheme, watchSystemDark, type ThemeMode } from "../services/theme.js";
import { combineTeamSpeakTarget, DEFAULT_TEAM_SPEAK_PORT, isValidTeamSpeakPort, splitTeamSpeakTarget } from "../services/teamspeak-target.js";
import { isLanguage, useI18n } from "../i18n/use-i18n.js";
import { avatarInitial, formatTime as formatTimestamp, median, microphoneErrorMessage, serverKey } from "../lib/format.js";
import { localizeAudioNotice, localizeMessage, visibleErrorCode } from "../lib/messages.js";
import { readStorage, writeStorage, removeStorage } from "@/lib/safe-storage";

// Sizing for the join header actions. Labels wrap (de and ru are long) and hide on
// narrow screens, where the buttons shrink to squares.
const headerActionClass = "shrink-0 text-fg-muted hover:text-accent max-[740px]:size-9 max-[391px]:size-8";
const joinActionClass = "h-auto min-h-8 whitespace-normal py-1 text-left text-[11px] leading-[1.15] max-[740px]:w-8 max-[740px]:px-0 max-[740px]:py-0 max-[420px]:size-7 max-[420px]:min-h-7";

interface TreeChannel extends ChannelInfo {
  depth: number;
  members: ChannelMember[];
}

const {
  state: voiceState,
  members,
  channels,
  chatMessages,
  serverEvents,
  pokeNotifications,
  microphoneMuted,
  noiseSuppressionEnabled,
  inputVolume,
  outputVolume,
  outputMuted,
  notificationVolume,
  voxThreshold,
  inputDevices,
  outputDevices,
  selectedInputDeviceId,
  selectedOutputDeviceId,
  outputDeviceSupported,
  audioPermission,
  audioContextState,
  identityMaterial,
  micLevel,
  microphoneTestActive,
  testAudioUrl,
  speakingIds,
  volumes,
  whisperTargetIds,
  whisperActive,
  setVolume,
  setInputVolume,
  setNoiseSuppressionEnabled,
  setOutputVolume,
  toggleOutputMute,
  setVoxThreshold,
  setNotificationVolume,
  prepareInputDevices,
  refreshAudioDevices,
  setInputDevice,
  setOutputDevice,
  startMicrophoneTest,
  stopMicrophoneTest,
  playNotification,
  connect,
  reconnectNow,
  disconnect,
  switchChannel,
  moveClient,
  sendTextMessage,
  sendServerMessage,
  sendPrivateMessage,
  sendPoke,
  setAway,
  setWhisperTargets,
  setWhisperActive,
  setMicrophoneMuted,
  accompanimentActive,
  accompanimentErrorCode,
  screenShareStreams,
  screenShareActive,
  screenShareStarting,
  screenShareViewing,
  screenShareViewingStreamId,
  screenShareRemoteStream,
  screenShareError,
  screenShareErrorCode,
  screenShareRemoteVolume,
  screenShareWebRtcStats,
  startAccompaniment,
  stopAccompaniment,
  startScreenShare,
  stopScreenShare,
  joinScreenShare,
  leaveScreenShare,
  checkSupport,
  clearError,
  measureLatency,
} = useVoiceWebSocket();

const query = new URLSearchParams(location.search);
const initialChannel = query.get("channel") ?? "";
const inviteToken = query.get("invite") ?? "";
const initialTarget = initialServerTarget();
const nickname = ref(readStorage("webspeak:nickname") ?? "");
const channel = ref(initialChannel);
const serverHost = ref(initialTarget.address);
const serverPort = ref(initialTarget.port);
const serverPassword = ref("");
const accessMode = ref<"fixed" | "open">("fixed");
const rememberIdentity = ref(readStorage("webspeak:remember-identity") !== "0");
const favoriteServers = ref<FavoriteServer[]>([]);
const recentServers = ref<RecentServer[]>([]);
const initialized = ref(false);
const siteName = ref("WebSpeak");
const welcomeTextZh = ref("");
const welcomeTextEn = ref("");
const welcomeTextDe = ref("");
const welcomeTextRu = ref("");
const welcomeTextJa = ref("");
const appVersion = ref("0.2.4");
const visitorNumber = ref<number | null>(null);
const visitorTotal = ref<number | null>(null);
const accelerationRelays = ref<Array<{ id: string; name: string }>>([]);
const accelerationRelayId = ref("");
const accelerationAvailable = computed(() => accelerationRelays.value.length > 0);
const browserError = ref("");
const serverConfigLoading = ref(true);
const memberQuery = ref("");
const messageDraft = ref("");
const selectedChannelId = ref("");
const settingsOpen = ref(false);
const channelPasswordDialog = reactive({ open: false, channelId: "", password: "", error: "", submitting: false });
const serverPasswordDialog = reactive({ open: false, password: "", errorCode: "" });
const qqModalOpen = ref(false);
const qqJoinUrl = "http://qm.qq.com/cgi-bin/qm/qr?_wv=1027&k=yhumUMDD9PmyYFWdXWUb_x7hM5trFQY8&authKey=Pw3HBGT7GwMinTQnuFGfnpf0aRSzXOJKcAiujVP1%2BXMpjheAKrncTRivicBJxpjV&noverify=0&group_code=869500475";
const audioSettingsError = ref("");
const chatListEl = ref<HTMLElement | null>(null);
const screenVideoEl = ref<HTMLVideoElement | null>(null);
const screenSharePlayerEl = ref<HTMLElement | null>(null);
const screenShareFullscreen = ref(false);
type ScreenShareResolutionPreset = "source" | "720p" | "1080p";
const screenShareResolutionOptions: Array<{ value: ScreenShareResolutionPreset; width?: number; height?: number; label: string }> = [
  { value: "source", label: "screenShareResolutionSource" },
  { value: "720p", width: 1280, height: 720, label: "screenShareResolution720p" },
  { value: "1080p", width: 1920, height: 1080, label: "screenShareResolution1080p" },
];
const screenShareFrameRateOptions = [5, 10, 15, 24, 30, 60];
const storedScreenShareResolution = readStorage("webspeak:screen-share-resolution") as ScreenShareResolutionPreset | null;
const screenShareResolutionPreset = ref<ScreenShareResolutionPreset>(screenShareResolutionOptions.some((option) => option.value === storedScreenShareResolution) ? storedScreenShareResolution! : "1080p");
const storedScreenShareFrameRate = Number(readStorage("webspeak:screen-share-framerate"));
const screenShareFrameRate = ref(screenShareFrameRateOptions.includes(storedScreenShareFrameRate) ? storedScreenShareFrameRate : 15);
const screenShareSettingsOpen = ref(false);
function setScreenVideoElement(element: unknown): void {
  screenVideoEl.value = element instanceof HTMLVideoElement ? element : null;
}
const localPersistenceAvailable = isLocalPersistenceAvailable();
const identityReady = ref(!localPersistenceAvailable);
const chatTab = ref<"channel" | "server" | "private" | "events">("channel");
const privateClientId = ref(0);
const away = ref(false);
const awayMessage = ref("");
const memberMenu = ref<{ member: ChannelMember; x: number; y: number } | null>(null);
const draggedMember = ref<ChannelMember | null>(null);
const dragOverChannelId = ref("");
const memberPointerDrag = reactive({ member: null as ChannelMember | null, pointerId: null as number | null, startX: 0, startY: 0, active: false, targetChannelId: "" });
const mobileSection = ref<"channels" | "chat" | "voice" | "more">("channels");
// Rows of the mobile More panel: full-width outline buttons with a left-aligned icon and label.
const moreActionClass = "h-auto font-normal min-h-[52px] justify-start gap-2.5 whitespace-normal rounded-[9px] border-line bg-surface-2 px-3 text-left text-sm hover:border-accent hover:bg-surface-2 hover:text-accent";
const isMobileViewport = ref(false);
const whisperPttActive = ref(false);
const performancePanelOpen = ref(false);
const performanceRunning = ref(false);
const performanceSamples = ref<LatencyProbeResult[]>([]);
const performanceProbeResults = ref<Array<LatencyProbeResult | null>>([]);
const performanceAttempts = ref(0);
const PERFORMANCE_INTERVAL_MS = 3_000;
const PERFORMANCE_WINDOW_SIZE = 20;
let performanceTimer: number | null = null;
let performanceMonitorGeneration = 0;

const { language, loadLanguage, setLanguage, t } = useI18n();
loadLanguage();
const themeMode = ref<ThemeMode>(getStoredTheme());
// The operating system's setting, kept reactive so the button follows it while the theme is System (F26).
const prefersDark = ref(isDarkTheme("system"));
let stopWatchingSystemDark: (() => void) | null = null;
const themeIcon = computed(() => isDarkTheme(themeMode.value, prefersDark.value) ? "sun" : "moon");
const themeLabel = computed(() => isDarkTheme(themeMode.value, prefersDark.value) ? t("switchToLightTheme") : t("switchToDarkTheme"));
const localizedWelcomeText = computed(() => {
  const customText = {
    zh: welcomeTextZh.value,
    en: welcomeTextEn.value,
    de: welcomeTextDe.value,
    ru: welcomeTextRu.value,
    ja: welcomeTextJa.value,
  }[language.value];
  return customText || t("joinDescription");
});
applyTheme(themeMode.value);
function initialServerTarget() {
  const explicit = query.get("server") ?? query.get("target");
  if (explicit?.trim()) return splitTeamSpeakTarget(explicit);
  const host = (query.get("tsHost") ?? location.hostname).trim();
  const port = (query.get("tsPort") ?? DEFAULT_TEAM_SPEAK_PORT).trim();
  return splitTeamSpeakTarget(host, port || DEFAULT_TEAM_SPEAK_PORT);
}

function localizedMessage(message: string) {
  return localizeMessage(message, language.value);
}

function localizedAudioNotice(code: string, message: string) {
  return localizeAudioNotice(code, message, language.value);
}

// F24: the gateway used to write the event log itself, in Chinese, and the client showed `message`
// as it is. A gateway that sends `nickname` or `channelName` lets the sentence be built here with
// t() instead, in the page's own language; an older gateway sends neither, and `message` is shown
// unchanged (English and German among the entries showed no bug of their own before this).
function eventText(event: ServerEvent): string {
  switch (event.kind) {
    case "connection": return t("eventConnected");
    case "joined": return event.nickname ? t("eventMemberJoined", { nickname: event.nickname }) : event.message;
    case "left": return event.nickname ? t("eventMemberLeft", { nickname: event.nickname }) : event.message;
    case "moved": return event.nickname ? t("eventMemberMoved", { nickname: event.nickname }) : event.message;
    case "poke": return event.nickname ? `${event.nickname} ${t("pokedYou")}` : event.message;
    case "channelCreated": return event.channelName ? t("eventChannelCreated", { channel: event.channelName }) : event.message;
    case "channelRenamed": return event.channelName ? t("eventChannelRenamed", { channel: event.channelName }) : event.message;
    case "channelDeleted": return event.channelName ? t("eventChannelDeleted", { channel: event.channelName }) : event.message;
    default: return event.message;
  }
}

function formatTime(timestamp: number) {
  return formatTimestamp(timestamp, language.value);
}

function persistLanguage() {
  setLanguage(language.value);
  void saveLocalPreferences({ schemaVersion: 1, language: language.value });
}

function cycleTheme() {
  themeMode.value = nextTheme(themeMode.value, prefersDark.value);
  saveTheme(themeMode.value);
  void saveLocalPreferences({ schemaVersion: 1, theme: themeMode.value });
}

const screenShareIndicatorBars = [5, 10, 7, 12, 8, 10];

const channelTree = computed<TreeChannel[]>(() => {
  const source = [...channels];
  const sourceIndex = new Map(source.map((item, index) => [item.id, index]));
  const enriched = source.map((item) => ({
    ...item,
    members: (item.members ?? []).map((member) => ({ ...member, isSelf: member.id === voiceState.tsClientId })),
  }));
  const byId = new Map(enriched.map((item) => [item.id, item]));
  const depthCache = new Map<string, number>();

  function depthOf(item: ChannelInfo, visiting = new Set<string>()): number {
    if (depthCache.has(item.id)) return depthCache.get(item.id)!;
    if (!item.parentID || item.parentID === "0" || visiting.has(item.id)) return 0;
    const parent = byId.get(item.parentID);
    const depth = parent ? depthOf(parent, new Set(visiting).add(item.id)) + 1 : 0;
    depthCache.set(item.id, depth);
    return depth;
  }

  const childrenByParent = new Map<string, TreeChannel[]>();
  for (const item of enriched) {
    const channel = { ...item, depth: depthOf(item) };
    const siblings = childrenByParent.get(channel.parentID) ?? [];
    siblings.push(channel);
    childrenByParent.set(channel.parentID, siblings);
  }

  function orderSiblings(siblings: TreeChannel[]): TreeChannel[] {
    const bySiblingId = new Map(siblings.map((item) => [item.id, item]));
    const successors = new Map<string, TreeChannel[]>();
    const roots: TreeChannel[] = [];
    const sourceOrder = (left: TreeChannel, right: TreeChannel) =>
      (sourceIndex.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (sourceIndex.get(right.id) ?? Number.MAX_SAFE_INTEGER);

    for (const item of siblings) {
      const predecessor = item.order && item.order !== "0" && bySiblingId.has(item.order) ? item.order : "";
      if (!predecessor) roots.push(item);
      else successors.set(predecessor, [...(successors.get(predecessor) ?? []), item]);
    }

    roots.sort(sourceOrder);
    for (const items of successors.values()) items.sort(sourceOrder);

    const ordered: TreeChannel[] = [];
    const visited = new Set<string>();
    const append = (item: TreeChannel) => {
      if (visited.has(item.id)) return;
      visited.add(item.id);
      ordered.push(item);
      for (const successor of successors.get(item.id) ?? []) append(successor);
    };
    for (const root of roots) append(root);
    for (const item of [...siblings].sort(sourceOrder)) append(item);
    return ordered;
  }

  const orderedTree: TreeChannel[] = [];
  const visit = (parentID: string) => {
    for (const channel of orderSiblings(childrenByParent.get(parentID) ?? [])) {
      orderedTree.push(channel);
      visit(channel.id);
    }
  };
  visit("0");
  for (const channel of enriched) {
    if (!orderedTree.some((item) => item.id === channel.id)) {
      const fallback = { ...channel, depth: depthOf(channel) };
      orderedTree.push(fallback);
      visit(channel.id);
    }
  }
  return orderedTree;
});

const currentChannel = computed<TreeChannel | undefined>(() => {
  const explicitlySelected = channelTree.value.find((item) => item.id === selectedChannelId.value);
  if (explicitlySelected) return explicitlySelected;
  const fromSelf = channelTree.value.find((item) => item.members.some((member) => member.id === voiceState.tsClientId));
  if (fromSelf) return fromSelf;
  return channelTree.value.find((item) => item.name === channel.value) ?? channelTree.value[0];
});
/** The channel the member list says you are in right now, whoever moved you there (F22). */
const ownChannelId = computed(() => channelTree.value.find((item) => item.members.some((member) => member.id === voiceState.tsClientId))?.id ?? "");
const currentChannelName = computed(() => (currentChannel.value?.name ?? channel.value) || t("voiceLobby"));
const currentChannelDescription = computed(() => currentChannel.value?.description ?? "");
const screenShareErrorText = computed(() => {
  if (screenShareErrorCode.value === "SCREEN_SHARE_NATIVE_BRIDGE_REQUIRED") return t("screenShareNativeUnavailable");
  return screenShareError.value;
});
const currentMembers = computed<ChannelMember[]>(() => {
  const source = currentChannel.value ? currentChannel.value.members : members;
  return source.map((member) => ({ ...member, isSelf: member.isSelf || member.id === voiceState.tsClientId }));
});
const activeScreenShareStream = computed<ScreenShareStream | null>(() => screenShareStreams.find((stream) => stream.streamId === screenShareViewingStreamId.value) ?? null);
const screenSharePlayerViewers = computed(() => activeScreenShareStream.value?.viewers.slice(-5) ?? []);
const screenSharePlayerViewerCount = computed(() => activeScreenShareStream.value?.viewerCount ?? activeScreenShareStream.value?.viewers.length ?? 0);
const screenSharePlayerOwnerName = computed(() => activeScreenShareStream.value?.ownerNickname ?? t("screenShare"));
function screenShareStreamForMember(member: ChannelMember): ScreenShareStream | null {
  return screenShareStreams.find((stream) => {
    if (typeof stream.ownerClientId === "number" && stream.ownerClientId === member.id) return true;
    if (stream.source === "teamspeak" && stream.ownerPeerId === `ts-${member.id}`) return true;
    return stream.ownerNickname === member.nickname;
  }) ?? null;
}
function toggleScreenShareForMember(member: ChannelMember): void {
  const stream = screenShareStreamForMember(member);
  if (!stream) return;
  if (screenShareViewingStreamId.value === stream.streamId) leaveScreenShare();
  else joinScreenShare(stream.streamId);
}
function screenShareViewerStyle(viewer: { nickname: string; avatar?: string }) {
  return avatarStyle(viewer.nickname, viewer.nickname === nickname.value, viewer.avatar ?? "");
}
const roomMembers = computed(() => currentMembers.value.slice(0, 4));
const memberChannels = computed<TreeChannel[]>(() => {
  if (channelTree.value.length) return channelTree.value;
  return [{ id: "__current__", parentID: "0", name: currentChannelName.value, description: currentChannelDescription.value, members: currentMembers.value, depth: 0 }];
});
const filteredMemberChannels = computed(() => {
  const search = memberQuery.value.trim().toLowerCase();
  if (!search) return memberChannels.value;
  return memberChannels.value.filter((item) => item.name.toLowerCase().includes(search) || item.members.some((member) => member.nickname.toLowerCase().includes(search)));
});
const memberMoveMenuCurrentChannel = computed<TreeChannel | null>(() => {
  const member = memberMenu.value?.member;
  const currentId = currentChannel.value?.id;
  if (!member || !currentId || currentId === "__current__") return null;
  const sourceChannelId = memberChannels.value.find((channel) => channel.members.some((candidate) => candidate.id === member.id))?.id ?? "";
  return memberChannels.value.find((channel) => channel.id === currentId) ?? null;
});
const memberMoveMenuCurrentSameChannel = computed(() => {
  const member = memberMenu.value?.member;
  const currentId = memberMoveMenuCurrentChannel.value?.id;
  if (!member || !currentId) return false;
  return memberChannels.value.find((channel) => channel.members.some((candidate) => candidate.id === member.id))?.id === currentId;
});
const memberMoveMenuOtherChannels = computed<TreeChannel[]>(() => {
  const member = memberMenu.value?.member;
  if (!member) return [];
  const sourceChannelId = memberChannels.value.find((channel) => channel.members.some((candidate) => candidate.id === member.id))?.id ?? "";
  const currentChannelId = memberMoveMenuCurrentChannel.value?.id;
  return memberChannels.value.filter((channel) => channel.id !== "__current__" && channel.id !== sourceChannelId && channel.id !== currentChannelId);
});
const whisperTargets = computed(() => [...whisperTargetIds].map((id) => members.find((member) => member.id === id)).filter((member): member is ChannelMember => Boolean(member)));

const privateConversations = computed(() => {
  const conversations = new Map<string, { id: number; name: string; lastMessage: number }>();
  for (const message of chatMessages) {
    if (message.scope !== "private" || !message.conversationId) continue;
    const id = Number(message.conversationId);
    if (!id) continue;
    const member = members.find((candidate) => candidate.id === id);
    const existing = conversations.get(message.conversationId);
    conversations.set(message.conversationId, { id, name: member?.nickname ?? existing?.name ?? message.invokerName, lastMessage: Math.max(existing?.lastMessage ?? 0, message.timestamp) });
  }
  // The chat just opened from the member menu has no message yet: list it under the member's name (F25).
  if (privateClientId.value && !conversations.has(String(privateClientId.value))) {
    const member = members.find((candidate) => candidate.id === privateClientId.value);
    if (member) conversations.set(String(privateClientId.value), { id: privateClientId.value, name: member.nickname, lastMessage: 0 });
  }
  return [...conversations.values()].sort((a, b) => b.lastMessage - a.lastMessage);
});

const visibleChatMessages = computed(() => {
  if (chatTab.value === "server") return chatMessages.filter((message) => message.scope === "server");
  if (chatTab.value === "private") return chatMessages.filter((message) => message.scope === "private" && message.conversationId === String(privateClientId.value));
  if (chatTab.value !== "channel") return [];
  const channelId = currentChannel.value?.id;
  return chatMessages.filter((message) => message.scope === "channel" && (!message.targetId || message.targetId === "0" || !channelId || message.targetId === channelId));
});

const chatTabLabel = computed(() => chatTab.value === "channel" ? t("textChannel") : chatTab.value === "server" ? t("serverChat") : chatTab.value === "private" ? t("privateMessage") : t("eventLog"));
const chatPanelId = "chat-tabpanel";
const chatTabId = (key: string) => `chat-tab-${key}`;
const activeChatTabId = computed(() => chatTabId(chatTab.value === "private" ? `private-${privateClientId.value}` : chatTab.value));
const chatTitle = computed(() => chatTab.value === "channel" ? t("channelChat", { channel: currentChannelName.value }) : chatTab.value === "server" ? t("serverChat") : chatTab.value === "events" ? t("eventLog") : privateConversations.value.find((conversation) => conversation.id === privateClientId.value)?.name ?? t("privateMessage"));
const chatPlaceholder = computed(() => chatTab.value === "private" ? t("privateMessagePlaceholder") : chatTab.value === "server" ? t("serverMessagePlaceholder") : t("sendMessagePlaceholder"));
const visiblePokes = computed(() => pokeNotifications.slice(-3));
const memberMenuStyle = computed(() => {
  if (!memberMenu.value) return {};
  // #app applies zoom:var(--ui-scale) which also scales fixed-element
  // coordinates against the viewport; divide the pointer position back to CSS
  // pixels so the context menu opens exactly where the user clicked on large
  // displays.
  const scale = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--ui-scale")) || 1;
  return { left: `${memberMenu.value.x / scale}px`, top: `${memberMenu.value.y / scale}px` };
});
const performanceStats = computed(() => {
  const samples = performanceSamples.value;
  const attempts = performanceAttempts.value;
  const gatewaySamples = samples.map((sample) => sample.browserRttMs);
  const teamSpeakSamples = samples.filter((sample) => sample.teamSpeakReachable && sample.teamSpeakLatencyMs != null).map((sample) => sample.teamSpeakLatencyMs as number);
  return {
    gatewayLatencyMs: median(gatewaySamples),
    gatewayLossPercent: attempts > 0 ? Math.round(((attempts - samples.length) / attempts) * 100) : null,
    teamSpeakLatencyMs: median(teamSpeakSamples),
    teamSpeakLossPercent: attempts > 0 ? Math.round(((attempts - teamSpeakSamples.length) / attempts) * 100) : null,
    ready: attempts > 0,
  };
});

watch(channelTree, (list) => {
  if (!selectedChannelId.value && list[0]) {
    selectedChannelId.value = list.find((item) => item.name === channel.value)?.id
      ?? list.find((item) => item.members.some((member) => member.id === voiceState.tsClientId))?.id
      ?? "";
  }
}, { deep: true });
// F22: a move made by someone else changes the member list, not selectedChannelId, so the
// highlight, the voice cards and the channel chat stayed on the channel you used to be in. Follow
// the member list instead: once your own channel is known, keep selectedChannelId matched to it.
// The very first assignment is left to the watcher above, which also honours the channel you typed.
watch(ownChannelId, (id, previous) => {
  if (id && previous) selectedChannelId.value = id;
});
watch([() => chatMessages.length, chatTab, privateClientId], () => nextTick(scrollChatToEnd));
watch(() => chatMessages.length, (length, previousLength) => {
  const latest = chatMessages[length - 1];
  if (latest && length > previousLength && latest.scope === "private" && !latest.isSelf) playNotification("private");
});
watch(() => voiceState.errorCode, (code) => {
  if (code !== "CHANNEL_PASSWORD_REQUIRED" || !selectedChannelId.value) return;
  channelPasswordDialog.open = true;
  channelPasswordDialog.channelId = selectedChannelId.value;
  channelPasswordDialog.password = "";
  channelPasswordDialog.error = t("channelPasswordRetry");
  channelPasswordDialog.submitting = false;
  clearError();
});
watch(() => voiceState.errorCode, (code) => {
  if (code !== "SERVER_PASSWORD_REQUIRED" && code !== "INVALID_SERVER_PASSWORD") return;
  serverPasswordDialog.open = true;
  serverPasswordDialog.password = "";
  serverPasswordDialog.errorCode = code;
  clearError();
});
watch(() => voiceState.channelSwitchedChannelId, (channelId) => {
  if (!channelPasswordDialog.open || !channelId || channelId !== channelPasswordDialog.channelId) return;
  channelPasswordDialog.open = false;
  channelPasswordDialog.channelId = "";
  channelPasswordDialog.password = "";
  channelPasswordDialog.error = "";
  channelPasswordDialog.submitting = false;
});
watch(() => pokeNotifications.length, (length, previousLength) => {
  const latest = pokeNotifications[length - 1];
  if (!latest || length <= previousLength) return;
  showToast(`${latest.invokerName} ${t("pokedYou")}${latest.message ? `：${latest.message}` : ""}`);
  playNotification("poke");
  if (typeof Notification !== "undefined" && Notification.permission === "granted") new Notification(t("poke"), { body: `${latest.invokerName}: ${latest.message || t("pokedYou")}` });
});
watch(settingsOpen, (open) => {
  if (open) {
    audioSettingsError.value = "";
    prepareInputDevices().catch((error: unknown) => {
      audioSettingsError.value = microphoneErrorMessage(error);
    });
  } else {
    stopMicrophoneTest();
  }
});
watch([screenShareRemoteStream, screenShareRemoteVolume], ([stream, volume]) => {
  void nextTick(() => {
    const video = screenVideoEl.value;
    if (!video) return;
    if (video.srcObject !== stream) video.srcObject = stream;
    video.volume = Math.max(0, Math.min(1, volume ?? 1));
    if (stream) void video.play().catch(() => undefined);
  });
});
watch(screenShareViewing, (viewing) => {
  if (!viewing && document.fullscreenElement === screenSharePlayerEl.value) void document.exitFullscreen().catch(() => undefined);
});
watch(rememberIdentity, (remember) => {
  writeStorage("webspeak:remember-identity", remember ? "1" : "0");
  if (!remember) {
    identityMaterial.value = "";
    void removeStoredIdentity();
  }
});
watch([rememberIdentity, identityMaterial], ([remember, material]) => {
  if (remember && material) void saveStoredIdentity(material);
  if (!remember && material) identityMaterial.value = "";
});
watch(() => voiceState.connected, (connected) => {
  if (!connected) {
    stopPerformanceMonitoring();
    return;
  }
  playNotification("connected");
  const address = currentServerTarget();
  if (!address) return;
  const recent: RecentServer = {
    id: serverKey(address),
    address,
    ...(nickname.value.trim() ? { nickname: nickname.value.trim() } : {}),
    ...(rememberIdentity.value && identityMaterial.value ? { identityId: "current" } : {}),
    lastConnectedAt: Date.now(),
    ...(channel.value.trim() ? { lastChannelHint: { name: channel.value.trim() } } : {}),
  };
  void recordRecentServer(recent).then(() => listRecentServers().then((items) => { recentServers.value = items; }));
  if (performancePanelOpen.value) startPerformanceMonitoring();
});

function togglePerformancePanel() {
  performancePanelOpen.value = !performancePanelOpen.value;
  if (performancePanelOpen.value) startPerformanceMonitoring();
  else stopPerformanceMonitoring();
}

function resetPerformanceSamples(): void {
  performanceProbeResults.value = [];
  performanceSamples.value = [];
  performanceAttempts.value = 0;
}

function startPerformanceMonitoring(): void {
  if (performanceTimer || !voiceState.connected) return;
  resetPerformanceSamples();
  const generation = ++performanceMonitorGeneration;
  void runPerformanceProbe(generation);
  performanceTimer = window.setInterval(() => {
    void runPerformanceProbe(generation);
  }, PERFORMANCE_INTERVAL_MS);
}

function stopPerformanceMonitoring(): void {
  if (performanceTimer) {
    clearInterval(performanceTimer);
    performanceTimer = null;
  }
  performanceMonitorGeneration += 1;
  performanceRunning.value = false;
}

function refreshPerformanceProbe(): void {
  void runPerformanceProbe();
}

async function runPerformanceProbe(generation = performanceMonitorGeneration): Promise<void> {
  if (performanceRunning.value || !voiceState.connected || !performancePanelOpen.value) return;
  performanceRunning.value = true;
  try {
    const sample = await measureLatency();
    if (generation !== performanceMonitorGeneration || !performancePanelOpen.value) return;
    performanceProbeResults.value.push(sample);
    if (performanceProbeResults.value.length > PERFORMANCE_WINDOW_SIZE) performanceProbeResults.value.shift();
    performanceAttempts.value = performanceProbeResults.value.length;
    performanceSamples.value = performanceProbeResults.value.filter((result): result is LatencyProbeResult => result !== null);
  } finally {
    if (generation === performanceMonitorGeneration) performanceRunning.value = false;
  }
}
watch(() => voiceState.reconnecting, (reconnecting, wasReconnecting) => {
  if (reconnecting && !wasReconnecting) {
    playNotification("disconnected");
  }
});
watch(() => voiceState.reconnectFailed, (failed, wasFailed) => {
  if (failed && !wasFailed) playNotification("reconnectFailed");
});

let deviceChangeHandler: (() => void) | undefined;
let viewportMediaQuery: MediaQueryList | undefined;
let viewportChangeHandler: (() => void) | undefined;
let fullscreenChangeHandler: (() => void) | undefined;

onMounted(() => {
  prefersDark.value = isDarkTheme("system");
  stopWatchingSystemDark = watchSystemDark((dark) => { prefersDark.value = dark; });
  browserError.value = checkSupport() ?? "";
  void loadPublicConfig();
  void loadLocalPreferences().then((preferences) => {
    if (!readStorage("webspeak:language") && isLanguage(preferences.language)) language.value = preferences.language;
    if (!readStorage("webspeak:theme") && (preferences.theme === "system" || preferences.theme === "light" || preferences.theme === "dark")) {
      themeMode.value = preferences.theme;
      applyTheme(themeMode.value);
    }
  });
  void loadStoredIdentity().then((stored) => {
    if (stored && readStorage("webspeak:remember-identity") !== "0") {
      identityMaterial.value = stored.privateMaterial;
      rememberIdentity.value = true;
    }
  }).finally(() => {
    identityReady.value = true;
  });
  void listFavorites().then((items) => { favoriteServers.value = items; });
  void listRecentServers().then((items) => { recentServers.value = items; });
  deviceChangeHandler = () => { void refreshAudioDevices().catch(() => undefined); };
  navigator.mediaDevices?.addEventListener("devicechange", deviceChangeHandler);
  viewportMediaQuery = window.matchMedia("(max-width: 740px)");
  viewportChangeHandler = () => {
    isMobileViewport.value = viewportMediaQuery?.matches ?? false;
    if (!isMobileViewport.value) memberMenu.value = null;
    else if (accompanimentActive.value) void stopAccompaniment();
  };
  viewportChangeHandler();
  viewportMediaQuery.addEventListener?.("change", viewportChangeHandler);
  fullscreenChangeHandler = syncScreenShareFullscreen;
  document.addEventListener("fullscreenchange", fullscreenChangeHandler);
});
onUnmounted(() => {
  stopWatchingSystemDark?.();
  stopWatchingSystemDark = null;
  stopPerformanceMonitoring();
  disconnect();
  if (deviceChangeHandler) navigator.mediaDevices?.removeEventListener("devicechange", deviceChangeHandler);
  if (viewportMediaQuery && viewportChangeHandler) viewportMediaQuery.removeEventListener?.("change", viewportChangeHandler);
  if (fullscreenChangeHandler) document.removeEventListener("fullscreenchange", fullscreenChangeHandler);
});

function doConnect() {
  if (!canJoin.value || voiceState.connecting) return;
  clearError();
  nickname.value = nickname.value.trim();
  writeStorage("webspeak:nickname", nickname.value);
  void saveLocalPreferences({ schemaVersion: 1, lastNickname: nickname.value });
  if (accessMode.value === "open") {
    serverHost.value = serverHost.value.trim();
    serverPort.value = serverPort.value.trim();
  }
  selectedChannelId.value = "";
  // Keep the password field available for a retry even when the target is
  // administrator-managed. The gateway still controls the target in fixed
  // mode and only accepts a non-empty retry password for that target.
  connect(currentServerTarget(), channel.value.trim(), nickname.value, serverPassword.value, rememberIdentity.value ? identityMaterial.value : "", rememberIdentity.value, inviteToken, Boolean(accelerationRelayId.value), accelerationRelayId.value);
}

function doDisconnect() {
  disconnect();
  selectedChannelId.value = "";
  showToast(t("leftToast"));
}

function submitServerPassword() {
  if (!serverPasswordDialog.open || !serverPasswordDialog.password) return;
  serverPassword.value = serverPasswordDialog.password;
  serverPasswordDialog.open = false;
  serverPasswordDialog.password = "";
  serverPasswordDialog.errorCode = "";
  doConnect();
}

function cancelServerPassword() {
  serverPasswordDialog.open = false;
  serverPasswordDialog.password = "";
  serverPasswordDialog.errorCode = "";
  clearError();
}

function selectChannel(item: TreeChannel) {
  selectedChannelId.value = item.id;
  channel.value = item.name;
  chatTab.value = "channel";
  switchChannel(item.id);
}

function submitChannelPassword() {
  if (!channelPasswordDialog.open || !channelPasswordDialog.channelId || !channelPasswordDialog.password) return;
  channelPasswordDialog.error = "";
  channelPasswordDialog.submitting = true;
  switchChannel(channelPasswordDialog.channelId, channelPasswordDialog.password);
}

function cancelChannelPassword() {
  const ownChannel = channelTree.value.find((item) => item.members.some((member) => member.id === voiceState.tsClientId));
  if (ownChannel) selectedChannelId.value = ownChannel.id;
  channelPasswordDialog.open = false;
  channelPasswordDialog.channelId = "";
  channelPasswordDialog.password = "";
  channelPasswordDialog.error = "";
  channelPasswordDialog.submitting = false;
  clearError();
}

function selectChannelById() {
  const item = channelTree.value.find((candidate) => candidate.id === selectedChannelId.value);
  if (item) selectChannel(item);
}

function channelLabel(item: TreeChannel) {
  return `${"　".repeat(item.depth)}${item.name}`;
}

function doShare() {
  const invite = new URL(location.href);
  invite.searchParams.delete("token");
  invite.searchParams.delete("target");
  invite.searchParams.delete("tsHost");
  invite.searchParams.delete("tsPort");
  invite.searchParams.delete("server");
  if (accessMode.value === "open" && serverHost.value.trim()) invite.searchParams.set("server", currentServerTarget());
  if (channel.value) invite.searchParams.set("channel", channel.value);
  navigator.clipboard?.writeText(invite.toString()).then(() => showToast(t("copiedToast")), () => showToast(t("copyFailedToast"), "danger"));
}

const canJoin = computed(() => Boolean(
  initialized.value
  && nickname.value.trim()
  && (accessMode.value === "fixed" || (serverHost.value.trim() && isValidTeamSpeakPort(serverPort.value))),
));
const isFavorite = computed(() => favoriteServers.value.some((favorite) => favorite.id === serverKey(currentServerTarget())));

function currentServerTarget(): string {
  return combineTeamSpeakTarget(serverHost.value, serverPort.value);
}

function selectLocalServer(address: string, savedNickname?: string): void {
  const target = splitTeamSpeakTarget(address);
  serverHost.value = target.address;
  serverPort.value = target.port;
  if (savedNickname && !nickname.value.trim()) nickname.value = savedNickname;
}

async function toggleFavorite(): Promise<void> {
  const address = currentServerTarget();
  if (!address) return;
  const id = serverKey(address);
  const existing = favoriteServers.value.find((favorite) => favorite.id === id);
  if (existing) {
    await removeFavorite(id);
    favoriteServers.value = favoriteServers.value.filter((favorite) => favorite.id !== id);
    showToast(t("removedFavoriteToast"));
    return;
  }
  const favorite: FavoriteServer = { id, label: address, address, ...(nickname.value.trim() ? { nickname: nickname.value.trim() } : {}), ...(rememberIdentity.value && identityMaterial.value ? { identityId: "current" } : {}), ...(channel.value.trim() ? { lastChannelHint: { name: channel.value.trim() } } : {}) };
  await saveFavorite(favorite);
  favoriteServers.value = [...favoriteServers.value, favorite].sort((a, b) => a.label.localeCompare(b.label));
  showToast(t("savedFavoriteToast"));
}

async function clearBrowserData(): Promise<void> {
  if (!window.confirm(t("clearLocalDataConfirm"))) return;
  await clearStoredLocalData();
  for (const key of ["webspeak:nickname", "webspeak:language", "webspeak:theme", "webspeak:input-device", "webspeak:output-device", "webspeak:remember-identity"]) removeStorage(key);
  themeMode.value = "system";
  applyTheme(themeMode.value);
  identityMaterial.value = "";
  rememberIdentity.value = false;
  favoriteServers.value = [];
  recentServers.value = [];
  showToast(t("localDataCleared"));
}

async function loadPublicConfig() {
  try {
    const response = await fetch("/api/public-config", { headers: { accept: "application/json" } });
    if (!response.ok) return;
    const config = await response.json() as { version?: unknown; initialized?: unknown; siteName?: unknown; welcomeText?: unknown; welcomeTextEn?: unknown; welcomeTexts?: unknown; accessMode?: unknown; target?: unknown; visitorNumber?: unknown; visitorTotal?: unknown; accelerationAvailable?: unknown; accelerationRelays?: unknown };
    if (typeof config.version === "string" && config.version.trim()) appVersion.value = config.version.trim();
    visitorNumber.value = Number.isSafeInteger(config.visitorNumber) && Number(config.visitorNumber) > 0 ? Number(config.visitorNumber) : null;
    visitorTotal.value = Number.isSafeInteger(config.visitorTotal) && Number(config.visitorTotal) > 0 ? Number(config.visitorTotal) : null;
    initialized.value = config.initialized === true;
    if (typeof config.siteName === "string" && config.siteName.trim()) siteName.value = config.siteName.trim();
    if (typeof config.welcomeText === "string") welcomeTextZh.value = config.welcomeText;
    if (typeof config.welcomeTextEn === "string") welcomeTextEn.value = config.welcomeTextEn;
    if (config.welcomeTexts && typeof config.welcomeTexts === "object" && !Array.isArray(config.welcomeTexts)) {
      const welcomeTexts = config.welcomeTexts as Record<string, unknown>;
      if (typeof welcomeTexts.zh === "string") welcomeTextZh.value = welcomeTexts.zh;
      if (typeof welcomeTexts.en === "string") welcomeTextEn.value = welcomeTexts.en;
      if (typeof welcomeTexts.de === "string") welcomeTextDe.value = welcomeTexts.de;
      if (typeof welcomeTexts.ru === "string") welcomeTextRu.value = welcomeTexts.ru;
      if (typeof welcomeTexts.ja === "string") welcomeTextJa.value = welcomeTexts.ja;
    }
    accessMode.value = config.accessMode === "open" ? "open" : "fixed";
    accelerationRelays.value = Array.isArray(config.accelerationRelays)
      ? config.accelerationRelays.flatMap((value) => {
        if (!value || typeof value !== "object") return [];
        const relay = value as { id?: unknown; name?: unknown };
        return typeof relay.id === "string" && typeof relay.name === "string" && relay.id && relay.name
          ? [{ id: relay.id, name: relay.name }]
          : [];
      })
      : [];
    if (!accelerationAvailable.value || !accelerationRelays.value.some((relay) => relay.id === accelerationRelayId.value)) accelerationRelayId.value = "";
    const hasInviteTarget = query.has("server") || query.has("target") || query.has("tsHost") || query.has("tsPort");
    if (!hasInviteTarget && typeof config.target === "string" && config.target.trim()) {
      const target = splitTeamSpeakTarget(config.target);
      serverHost.value = target.address;
      serverPort.value = target.port;
    }
  } catch {
    // Keep joining disabled until the gateway can confirm its initialized policy.
  } finally {
    serverConfigLoading.value = false;
  }
}

function submitMessage() {
  if (!messageDraft.value.trim()) return;
  if (chatTab.value === "channel") sendTextMessage(messageDraft.value, currentChannel.value?.id ?? selectedChannelId.value);
  else if (chatTab.value === "server") sendServerMessage(messageDraft.value);
  else if (chatTab.value === "private" && privateClientId.value) sendPrivateMessage(privateClientId.value, messageDraft.value, String(privateClientId.value));
  messageDraft.value = "";
}

function openPrivateChat(clientId: number): void {
  if (!clientId || clientId === voiceState.tsClientId) return;
  privateClientId.value = clientId;
  chatTab.value = "private";
  if (isMobileViewport.value) mobileSection.value = "chat";
  memberMenu.value = null;
  nextTick(scrollChatToEnd);
}

// The desktop menu's trigger is a hidden zero-size span placed at the click point (F34), which
// cannot take the keyboard focus back when the menu closes: Reka's default then leaves the focus
// on the document. Remember which member's row opened it and, on close, give the focus to that
// row's own volume slider instead (F47); it exists for every row a menu can open on, whether the
// menu was opened with a right click or with Shift+F10 on the slider itself.
let memberMenuOpenerId: number | null = null;

function openMemberMenu(member: ChannelMember, event: Event): void {
  if (member.isSelf) return;
  const point = event instanceof MouseEvent ? event : undefined;
  memberMenuOpenerId = member.id;
  memberMenu.value = { member, x: point?.clientX ?? 20, y: point?.clientY ?? 20 };
}

function openMemberActions(member: ChannelMember): void {
  if (member.isSelf) return;
  memberMenuOpenerId = member.id;
  memberMenu.value = { member, x: 0, y: 0 };
}

function onMemberMenuCloseAutoFocus(event: Event): void {
  const id = memberMenuOpenerId;
  memberMenuOpenerId = null;
  if (id === null) return;
  const slider = document.querySelector<HTMLElement>(`.member-volume[data-member-id="${id}"] [role="slider"]`);
  if (!slider) return;
  event.preventDefault();
  slider.focus();
}

async function moveMemberDirect(member: ChannelMember, targetChannelId: string): Promise<void> {
  if (member.isSelf || !targetChannelId || targetChannelId === "__current__") return;
  const sourceChannel = memberChannels.value.find((channel) => channel.members.some((candidate) => candidate.id === member.id));
  if (sourceChannel?.id === targetChannelId) {
    memberMenu.value = null;
    return;
  }
  memberMenu.value = null;
  try {
    // Moving a visible client is a server-admin operation; channel passwords
    // must never be requested or forwarded for this action.
    await moveClient(member.id, targetChannelId);
    showToast(t("moveMemberSuccess"));
  } catch (error: unknown) {
    showToast(localizedMessage(error instanceof Error ? error.message : "操作失败"), "danger");
  }
}

function onMemberDragStart(member: ChannelMember, event: DragEvent): void {
  if (member.isSelf) {
    event.preventDefault();
    return;
  }
  draggedMember.value = member;
  dragOverChannelId.value = "";
  event.dataTransfer?.setData("text/plain", String(member.id));
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
}

function onMemberDragEnd(): void {
  draggedMember.value = null;
  dragOverChannelId.value = "";
}

function onMemberPointerDown(member: ChannelMember, event: PointerEvent): void {
  if (member.isSelf || event.button !== 0) return;
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest("input,button")) return;
  event.preventDefault();
  memberPointerDrag.member = member;
  memberPointerDrag.pointerId = event.pointerId;
  memberPointerDrag.startX = event.clientX;
  memberPointerDrag.startY = event.clientY;
  memberPointerDrag.active = false;
  memberPointerDrag.targetChannelId = "";
  const currentTarget = event.currentTarget as HTMLElement | null;
  currentTarget?.setPointerCapture?.(event.pointerId);
}

function onMemberPointerMove(event: PointerEvent): void {
  if (!memberPointerDrag.member || memberPointerDrag.pointerId !== event.pointerId) return;
  const distance = Math.hypot(event.clientX - memberPointerDrag.startX, event.clientY - memberPointerDrag.startY);
  if (!memberPointerDrag.active && distance < 6) return;
  event.preventDefault();
  memberPointerDrag.active = true;
  draggedMember.value = memberPointerDrag.member;
  const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-member-channel-id]");
  const targetChannelId = target?.dataset.memberChannelId ?? "";
  const sourceChannel = memberChannels.value.find((channel) => channel.members.some((candidate) => candidate.id === memberPointerDrag.member?.id));
  if (!sourceChannel || !targetChannelId || targetChannelId === sourceChannel.id) {
    memberPointerDrag.targetChannelId = "";
    dragOverChannelId.value = "";
    return;
  }
  memberPointerDrag.targetChannelId = targetChannelId;
  dragOverChannelId.value = targetChannelId;
}

function onMemberPointerUp(event: PointerEvent): void {
  if (!memberPointerDrag.member || memberPointerDrag.pointerId !== event.pointerId) return;
  const member = memberPointerDrag.member;
  const targetChannelId = memberPointerDrag.targetChannelId;
  const currentTarget = event.currentTarget as HTMLElement | null;
  currentTarget?.releasePointerCapture?.(event.pointerId);
  memberPointerDrag.member = null;
  memberPointerDrag.pointerId = null;
  memberPointerDrag.active = false;
  memberPointerDrag.targetChannelId = "";
  draggedMember.value = null;
  dragOverChannelId.value = "";
  if (targetChannelId) void moveMemberDirect(member, targetChannelId);
}

function onMemberPointerCancel(event: PointerEvent): void {
  if (!memberPointerDrag.member || memberPointerDrag.pointerId !== event.pointerId) return;
  const currentTarget = event.currentTarget as HTMLElement | null;
  currentTarget?.releasePointerCapture?.(event.pointerId);
  memberPointerDrag.member = null;
  memberPointerDrag.pointerId = null;
  memberPointerDrag.active = false;
  memberPointerDrag.targetChannelId = "";
  draggedMember.value = null;
  dragOverChannelId.value = "";
}

function onChannelDragOver(channelItem: TreeChannel, event: DragEvent): void {
  const member = draggedMember.value;
  if (!member || channelItem.id === "__current__") return;
  const sourceChannel = memberChannels.value.find((channel) => channel.members.some((candidate) => candidate.id === member.id));
  if (!sourceChannel || sourceChannel.id === channelItem.id) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  dragOverChannelId.value = channelItem.id;
}

function onChannelDragLeave(channelItem: TreeChannel, event: DragEvent): void {
  const currentTarget = event.currentTarget;
  const relatedTarget = event.relatedTarget;
  if (currentTarget instanceof HTMLElement && relatedTarget instanceof Node && currentTarget.contains(relatedTarget)) return;
  if (dragOverChannelId.value === channelItem.id) dragOverChannelId.value = "";
}

function onChannelDrop(channelItem: TreeChannel, event: DragEvent): void {
  event.preventDefault();
  const member = draggedMember.value;
  onMemberDragEnd();
  if (!member || channelItem.id === "__current__") return;
  void moveMemberDirect(member, channelItem.id);
}

function toggleWhisperTarget(member: ChannelMember): void {
  if (member.isSelf) return;
  const targets = new Set(whisperTargetIds);
  if (targets.has(member.id)) targets.delete(member.id);
  else if (targets.size < 8) targets.add(member.id);
  setWhisperTargets([...targets]);
  showToast(targets.has(member.id) ? t("setWhisperTarget") : t("removeWhisperTarget"));
}

function clearWhisperTargets(): void {
  stopWhisperTalk();
  setWhisperTargets([]);
}

function pokeMember(member: ChannelMember): void {
  sendPoke(member.id, window.prompt(t("pokeMessagePrompt"), "") ?? "");
  showToast(t("pokeSent"));
}

function copyMemberName(member: ChannelMember): void {
  navigator.clipboard?.writeText(member.nickname).then(() => showToast(t("copiedNickname")), () => showToast(t("copyFailedToast"), "danger"));
}

function toggleAway(): void {
  away.value = !away.value;
  awayMessage.value = away.value ? (window.prompt(t("awayPrompt"), awayMessage.value) ?? "") : "";
  setAway(away.value, awayMessage.value);
}

function dismissPoke(id: string): void {
  const index = pokeNotifications.findIndex((poke) => poke.id === id);
  if (index >= 0) pokeNotifications.splice(index, 1);
}

function scrollChatToEnd() {
  const list = chatListEl.value;
  if (list) list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
}

function showToast(message: string, variant: "success" | "danger" = "success") {
  raiseToast({ title: message, variant, duration: 2800 });
}

// style-budget: allow avatar-colors
const avatarColors = ["#9edbd4", "#b9d4c5", "#e8c6a8", "#c5c7e8", "#edd2d4", "#c8d9e9", "#e4d3b8"];
// style-budget: end
function avatarStyle(name: string, isSelf = false, avatar = "") {
  const fallback = isSelf ? "linear-gradient(135deg, var(--ws-accent), color-mix(in srgb, var(--ws-accent) 75%, var(--ws-fg)))" : "";
  let hash = 0;
  for (let index = 0; index < name.length; index++) hash = name.charCodeAt(index) + ((hash << 5) - hash);
  return {
    background: fallback || avatarColors[Math.abs(hash) % avatarColors.length],
    ...(avatar ? { backgroundImage: `url("${avatar}")`, backgroundPosition: "center", backgroundSize: "cover" } : {}),
  };
}

function messageAvatar(message: ChatMessage): string {
  const member = members.find((candidate) =>
    (typeof message.senderId === "number" && candidate.id === message.senderId) ||
    (Boolean(message.senderUid) && candidate.uid === message.senderUid),
  );
  return member?.avatar ?? "";
}

function isSpeaking(member: ChannelMember) {
  return speakingIds.has(member.id);
}

function memberDisplayName(member: ChannelMember): string {
  return member.isSelf ? `${member.nickname}${t("selfSuffix")}` : member.nickname;
}

async function onInputDeviceChange(deviceId: string | number | undefined) {
  audioSettingsError.value = "";
  try {
    await setInputDevice(String(deviceId ?? ""));
  } catch (error: unknown) {
    audioSettingsError.value = microphoneErrorMessage(error, "无法切换麦克风");
  }
}

async function onOutputDeviceChange(deviceId: string | number | undefined) {
  audioSettingsError.value = "";
  try {
    await setOutputDevice(String(deviceId ?? ""));
  } catch (error: unknown) {
    audioSettingsError.value = localizedMessage(error instanceof Error ? error.message : "无法切换扬声器");
  }
}

async function toggleMicTest() {
  audioSettingsError.value = "";
  try {
    if (microphoneTestActive.value) stopMicrophoneTest();
    else await startMicrophoneTest();
  } catch (error: unknown) {
    audioSettingsError.value = microphoneErrorMessage(error);
  }
}

const audioStatus = computed<{ variant: "success" | "warning" | "danger" | "neutral"; label: string }>(() => {
  if (audioContextState.value === "running") return voiceState.microphoneError ? { variant: "danger", label: t("audioUnavailable") } : { variant: "success", label: t("audioReady") };
  if (audioContextState.value === "suspended") return { variant: "warning", label: t("audioSuspended") };
  return { variant: "neutral", label: t("audioUnknown") };
});

// The level bar is written straight to the element, so the 50 Hz level never re-renders the panel.
const micLevelMeter = ref<InstanceType<typeof Meter> | null>(null);
watch([micLevel, micLevelMeter], ([level, meter]) => meter?.setLevel(level), { flush: "post" });

const micMeterBars = computed(() => Math.round(micLevel.value * 24));
function meterBarHeight(index: number) {
  if (!microphoneTestActive.value) return 5;
  const intensity = Math.max(0, micLevel.value - (index / 24) * 0.65);
  return 5 + Math.round(intensity * 34);
}

function toggleMicrophone(): void {
  setMicrophoneMuted(!microphoneMuted.value);
  showToast(microphoneMuted.value ? t("microphoneMuted") : t("microphoneActive"));
}

function syncScreenShareFullscreen(): void {
  screenShareFullscreen.value = document.fullscreenElement === screenSharePlayerEl.value;
}

async function toggleScreenShareFullscreen(): Promise<void> {
  const player = screenSharePlayerEl.value;
  if (!player) return;
  try {
    if (document.fullscreenElement === player) await document.exitFullscreen();
    else if (player.requestFullscreen) await player.requestFullscreen();
  } catch {
    screenShareFullscreen.value = false;
  }
}

async function startScreenShareWithSettings(): Promise<void> {
  const preset = screenShareResolutionOptions.find((option) => option.value === screenShareResolutionPreset.value);
  const settings: ScreenShareOutputSettings = {
    ...(preset?.width && preset.height ? { maxWidth: preset.width, maxHeight: preset.height } : {}),
    maxFrameRate: screenShareFrameRate.value,
  };
  writeStorage("webspeak:screen-share-resolution", screenShareResolutionPreset.value);
  writeStorage("webspeak:screen-share-framerate", String(screenShareFrameRate.value));
  screenShareSettingsOpen.value = false;
  await startScreenShare(true, settings);
}

async function toggleAccompaniment(): Promise<void> {
  try {
    if (accompanimentActive.value) {
      await stopAccompaniment();
      showToast(t("accompanimentStopped"));
      return;
    }
    await startAccompaniment();
    if (accompanimentActive.value) showToast(t("accompanimentStarted"));
  } catch {
    const messageKey = accompanimentErrorCode.value === "needsWebRtc"
      ? "accompanimentNeedsWebRtc"
      : accompanimentErrorCode.value === "noAudio"
        ? "accompanimentNoAudio"
        : accompanimentErrorCode.value === "unsupported"
          ? "accompanimentUnsupported"
          : "accompanimentPermissionDenied";
    showToast(t(messageKey));
  }
}

function onWhisperPttDown(event: PointerEvent): void {
  if (!whisperTargetIds.size) return;
  const target = event.currentTarget as HTMLElement | null;
  if (target?.setPointerCapture && !target.hasPointerCapture(event.pointerId)) target.setPointerCapture(event.pointerId);
  whisperPttActive.value = true;
  setWhisperActive(true);
}

function onWhisperPttUp(event: PointerEvent): void {
  const target = event.currentTarget as HTMLElement | null;
  if (target?.releasePointerCapture && target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
  stopWhisperTalk();
}

function stopWhisperTalk(): void {
  if (!whisperPttActive.value) return;
  whisperPttActive.value = false;
  setWhisperActive(false);
}
</script>

<style scoped>
:global(*) { box-sizing: border-box; }
:global(body) { margin: 0; background: var(--ws-surface-0); color: var(--ws-fg); font-family: var(--font-sans); }

.web-client { min-height: 100dvh; outline: none; background: var(--ws-surface-0); color: var(--ws-fg); line-height: normal; }
.join-page { min-height: 100dvh; display: flex; flex-direction: column; overflow: hidden; background: var(--ws-surface-0); }
.join-header, .join-content, .join-footer { width: min(1240px, calc(100% - 64px)); margin: 0 auto; }
.join-header, .join-content, .join-footer { position: relative; z-index: 1; }
.join-header { z-index: 10; }
.join-footer { z-index: 2; }
.join-header { min-height: 84px; display: flex; align-items: center; justify-content: space-between; }
.brand-lockup { display: flex; align-items: center; gap: 12px; }
.brand-mark { display: grid; place-items: center; color: var(--ws-accent-fg); background: var(--ws-accent); box-shadow: 0 8px 18px color-mix(in srgb, var(--ws-accent) 15%, transparent); }
.brand-mark { display: block; width: 40px; height: 40px; border-radius: 12px; object-fit: cover; }
.brand-lockup strong { display: block; color: var(--ws-accent); font-size: 18px; letter-spacing: -.04em; }
.brand-lockup strong span { color: var(--ws-fg); font-weight: 500; }
.brand-lockup small { display: block; margin-top: 2px; color: var(--ws-fg-muted); font-size: 10px; letter-spacing: .08em; text-transform: uppercase; }
.header-tools { display: flex; align-items: center; gap: 17px; }
.header-note { display: flex; align-items: center; gap: 8px; color: var(--ws-fg-muted); font-size: 12px; }
.language-switch { min-width: 50px; min-height: 28px; padding: 0 9px; color: var(--ws-accent); background: var(--ws-accent-soft); border: 1px solid var(--ws-line); border-radius: 7px; font-size: 10px; font-weight: 700; cursor: pointer; transition: .18s; }
.language-switch:hover { color: var(--ws-accent-fg); background: var(--ws-accent); border-color: var(--ws-accent); }
.language-menu-row { display: flex; align-items: center; gap: 10px; }
.language-menu-row > span { flex: 1; }
.tiny-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: var(--ws-success); box-shadow: 0 0 0 4px color-mix(in srgb, var(--ws-success) 14%, transparent); }
.join-content { flex: 1; display: grid; grid-template-columns: minmax(0, 1fr) minmax(480px, 520px); align-items: center; gap: clamp(40px, 6vw, 88px); padding: 38px 0 56px; }
.join-copy { max-width: 630px; }
.eyebrow { display: flex; align-items: center; gap: 9px; color: var(--ws-accent); font-size: 11px; font-weight: 700; letter-spacing: .13em; text-transform: uppercase; }
.eyebrow-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--ws-success); }
.join-copy h1 { margin: 20px 0 18px; color: var(--ws-fg); font-size: clamp(42px, 5.3vw, 72px); font-weight: 700; line-height: 1.04; letter-spacing: -.075em; }
.join-copy h1 em { color: var(--ws-accent); font-style: normal; }
.join-description { max-width: 500px; margin: 0; color: var(--ws-fg-muted); font-size: 17px; line-height: 1.75; }
.promise-list { display: flex; flex-wrap: wrap; gap: 24px; margin-top: 42px; }
.promise-item { display: flex; align-items: center; gap: 10px; min-width: 160px; }
.promise-icon { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 10px; color: var(--ws-accent); background: var(--ws-accent-soft); }
.promise-icon.mint { color: var(--ws-success); background: var(--ws-success-soft); }
.promise-icon.sand { color: var(--ws-warning); background: var(--ws-warning-soft); }
.promise-item b, .promise-item small { display: block; }
.promise-item b { color: var(--ws-fg); font-size: 12px; }
.promise-item small { margin-top: 3px; color: var(--ws-fg-muted); font-size: 10px; }
.visitor-count { position: relative; display: inline-flex; align-items: center; gap: 10px; width: fit-content; max-width: 100%; min-height: 42px; margin: 30px 0 0; padding: 7px 14px 7px 9px; overflow: hidden; color: var(--ws-accent); border: 1px solid color-mix(in srgb, var(--ws-accent) 42%, transparent); border-radius: 999px; background: linear-gradient(110deg, color-mix(in srgb, var(--ws-accent-soft) 94%, transparent), color-mix(in srgb, var(--ws-surface-1) 78%, transparent)); box-shadow: 0 10px 24px color-mix(in srgb, var(--ws-accent) 10%, transparent), inset 0 0 0 1px color-mix(in srgb, var(--ws-surface-1) 55%, transparent); font-size: 12px; font-weight: 700; line-height: normal; letter-spacing: .035em; }
.visitor-count::before { position: absolute; top: 0; bottom: 0; left: -45%; width: 38%; background: linear-gradient(105deg, transparent, color-mix(in srgb, var(--ws-surface-1) 62%, transparent), transparent); content: ""; pointer-events: none; transform: skewX(-18deg); animation: visitor-shimmer 3.6s 1.5s ease-in-out infinite; }
.visitor-count-orbit { position: absolute; top: -20px; right: 12px; width: 51px; height: 51px; border: 1px solid color-mix(in srgb, var(--ws-accent) 32%, transparent); border-radius: 50%; pointer-events: none; animation: visitor-orbit 4s ease-in-out infinite; }
.visitor-count-icon { position: relative; z-index: 1; display: grid; place-items: center; width: 27px; height: 27px; flex: 0 0 auto; color: var(--ws-accent-fg); border-radius: 50%; background: linear-gradient(135deg, var(--ws-accent), var(--ws-accent)); box-shadow: 0 0 0 4px color-mix(in srgb, var(--ws-accent) 12%, transparent), 0 0 18px color-mix(in srgb, var(--ws-accent) 24%, transparent); }
.visitor-count-label { position: relative; z-index: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.visitor-count-divider { position: relative; z-index: 1; width: 1px; height: 18px; flex: 0 0 auto; background: currentColor; opacity: .24; }
.visitor-count-total { position: relative; z-index: 1; min-width: 0; overflow: hidden; color: inherit; font-size: .92em; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; opacity: .78; }
.visitor-count-spark { position: relative; z-index: 1; color: var(--ws-accent); font-size: 15px; line-height: 1; animation: visitor-spark 2.1s ease-in-out infinite; }
.join-card { padding: 30px; border: 1px solid color-mix(in srgb, var(--ws-line) 80%, transparent); border-radius: 20px; background: color-mix(in srgb, var(--ws-surface-1) 86%, transparent); box-shadow: var(--shadow-sm); backdrop-filter: blur(12px); }
.section-kicker { color: var(--ws-fg-muted); font-size: 10px; font-weight: 700; letter-spacing: .16em; }
.join-card h2 { margin: 10px 0 7px; color: var(--ws-fg); font-size: 27px; font-weight: 700; letter-spacing: -.045em; }
.card-lead { margin: 0 0 7px; color: var(--ws-fg-muted); font-size: 13px; }
.notice { display: flex; align-items: flex-start; gap: 10px; min-width: 0; margin: 0 0 10px; padding: 9px 10px; border-radius: 10px; font-size: 12px; line-height: 1.45; }
.notice-content { min-width: 0; overflow-wrap: anywhere; }
.notice-content code { display: block; max-width: 100%; margin-top: 3px; overflow: hidden; color: currentColor; font-family: ui-monospace,SFMono-Regular,Consolas,monospace; font-size: 10px; line-height: 1.35; text-overflow: ellipsis; white-space: nowrap; opacity: .78; }
.error-notice { color: var(--ws-danger); background: var(--ws-danger-soft); border: 1px solid color-mix(in srgb, var(--ws-danger) 30%, var(--ws-surface-1)); }
.warning-notice { color: var(--ws-warning); background: var(--ws-warning-soft); border: 1px solid color-mix(in srgb, var(--ws-warning) 30%, var(--ws-surface-1)); }
.notice-symbol { display: grid; place-items: center; width: 16px; height: 16px; flex: 0 0 auto; border-radius: 50%; color: var(--ws-accent-fg); background: currentColor; color: var(--ws-accent-fg); font-size: 10px; font-weight: 800; }
.error-notice .notice-symbol { background: var(--ws-danger); }
.warning-notice .notice-symbol { background: var(--ws-warning); }
.join-form { display: grid; gap: 6px; }
.field-grid { display: grid; grid-template-columns: minmax(0, 1fr) 132px; gap: 12px; }
.join-meta { display: flex; align-items: center; justify-content: center; gap: 7px; margin-top: 12px; color: var(--ws-fg-muted); font-size: 10px; }
.join-footer { display: flex; align-items: center; min-height: 68px; background: var(--ws-surface-0); color: var(--ws-fg-muted); border-top: 1px solid var(--ws-line); font-size: 11px; }.join-footer a { color: var(--ws-accent); text-decoration: none; }.join-footer a:hover { color: var(--ws-accent); text-decoration: underline; }
.footer-separator { margin: 0 8px; color: var(--ws-line-strong); }.footer-spacer { flex: 1; }

.app-shell { display: grid; grid-template-columns: 76px 292px minmax(0, 1fr) 246px; height: 100dvh; overflow: hidden; background: var(--ws-surface-1); }.empty-icon { display: grid; place-items: center; width: 34px; height: 34px; margin: 0 auto 9px; color: var(--ws-accent); background: var(--ws-accent-soft); border-radius: 10px; }

.workspace { display: flex; min-width: 0; flex-direction: column; background: var(--ws-surface-1); }.workspace-header { display: flex; align-items: center; justify-content: space-between; min-height: 73px; padding: 0 29px; border-bottom: 1px solid var(--ws-line); }.breadcrumbs { display: flex; align-items: center; gap: 9px; min-width: 0; color: var(--ws-fg-muted); font-size: 12px; }.breadcrumbs strong { overflow: hidden; color: var(--ws-fg); text-overflow: ellipsis; white-space: nowrap; }.crumb-muted { color: var(--ws-fg-muted); }.mobile-brand { display: none; color: var(--ws-accent); font-size: 17px; font-weight: 800; letter-spacing: -.06em; }.mobile-brand em { color: var(--ws-fg); font-style: normal; font-weight: 500; }.workspace-actions { display: flex; align-items: center; gap: 8px; }
.workspace { display: flex; min-width: 0; flex-direction: column; background: var(--ws-surface-1); }.workspace-header { display: flex; align-items: center; justify-content: space-between; min-height: 73px; padding: 0 29px; border-bottom: 1px solid var(--ws-line); }.breadcrumbs { display: flex; align-items: center; gap: 9px; min-width: 0; color: var(--ws-fg-muted); font-size: 12px; }.breadcrumbs strong { overflow: hidden; color: var(--ws-fg); text-overflow: ellipsis; white-space: nowrap; }.crumb-muted { color: var(--ws-fg-muted); }.mobile-brand { display: none; color: var(--ws-accent); font-size: 17px; font-weight: 800; letter-spacing: -.06em; }.mobile-brand em { color: var(--ws-fg); font-style: normal; font-weight: 500; }.workspace-actions { display: flex; align-items: center; gap: 8px; }.workspace-language { margin-left: 3px; }
.workspace-scroll { flex: 1; overflow-y: auto; }.workspace-content { width: min(950px, calc(100% - 64px)); margin: 0 auto; padding: 31px 0 27px; }
.section-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; }.voice-section { margin-top: 34px; }.section-heading h2 { display: flex; align-items: center; gap: 7px; margin: 6px 0 0; color: var(--ws-fg); font-size: 20px; font-weight: 700; letter-spacing: -.04em; }.section-counter { color: var(--ws-fg-muted); font-size: 10px; }.voice-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(142px, 1fr)); gap: 12px; margin-top: 17px; }.voice-card { min-height: 152px; padding: 17px 11px 13px; border: 1px solid var(--ws-line); border-radius: 13px; background: var(--ws-surface-1); box-shadow: var(--shadow-sm); text-align: center; transition: .18s; }.voice-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-sm); }.voice-card.speaking { border-color: var(--ws-success); box-shadow: 0 0 14px color-mix(in srgb, var(--ws-success) 35%, transparent); }.voice-avatar-wrap { position: relative; width: 68px; margin: 0 auto 11px; }.voice-avatar { display: grid; place-items: center; width: 68px; height: 68px; color: var(--ws-accent-fg); border-radius: 50%; font-size: 20px; font-weight: 700; }.voice-card > strong, .voice-card > span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.voice-card > strong { color: var(--ws-fg); font-size: 12px; }.voice-card > span { margin-top: 5px; color: var(--ws-fg-muted); font-size: 10px; }.voice-card.speaking > span { color: var(--ws-success); }.more-card { display: grid; place-items: center; align-content: center; }.more-count { display: grid; place-items: center; width: 54px; height: 54px; margin-bottom: 11px; color: var(--ws-accent); background: var(--ws-accent-soft); border-radius: 50%; font-size: 14px; font-weight: 700; }.voice-empty { display: flex; align-items: center; gap: 11px; margin-top: 17px; padding: 18px; color: var(--ws-fg-muted); border: 1px dashed var(--ws-line); border-radius: 12px; font-size: 11px; }.voice-empty .empty-icon { margin: 0; width: 34px; height: 34px; }.voice-empty strong { color: var(--ws-fg-muted); }.voice-empty span:last-child { margin-left: auto; }
.chat-panel { margin-top: 34px; padding: 0 0 16px; border-top: 1px solid var(--ws-line); }.chat-heading { padding-top: 25px; }.chat-heading h2 .ui-icon { color: var(--ws-accent); }.message-list { display: flex; flex-direction: column; gap: 18px; min-height: 170px; max-height: 360px; overflow-y: auto; padding: 22px 8px 10px 3px; }.chat-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 145px; color: var(--ws-fg-muted); text-align: center; }.chat-empty-icon { display: grid; place-items: center; width: 48px; height: 48px; margin-bottom: 11px; color: var(--ws-accent); background: var(--ws-accent-soft); border-radius: 14px; }.chat-empty strong { color: var(--ws-fg-muted); font-size: 12px; }.chat-empty span { margin-top: 5px; font-size: 10px; }.message-row { display: flex; align-items: flex-start; gap: 11px; max-width: 78%; }.message-row.mine { align-self: flex-end; flex-direction: row-reverse; }.message-body { min-width: 0; }.message-meta { display: flex; align-items: baseline; gap: 8px; margin: 1px 0 6px; }.message-row.mine .message-meta { justify-content: flex-end; }.message-meta strong { color: var(--ws-fg); font-size: 11px; }.message-meta time { color: var(--ws-fg-muted); font-size: 9px; }.message-bubble { padding: 10px 13px; color: var(--ws-fg); background: var(--ws-surface-0); border-radius: 4px 13px 13px 13px; font-size: 12px; line-height: 1.55; }.message-row.mine .message-bubble { color: var(--ws-accent-fg); background: var(--ws-accent); border-radius: 13px 4px 13px 13px; }.message-composer { display: flex; align-items: center; gap: 7px; min-height: 48px; padding: 6px 8px 6px 12px; background: var(--ws-surface-0); border-radius: 11px; }

.member-panel { min-width: 0; padding: 26px 16px; color: var(--ws-fg); background: var(--ws-surface-1); border-left: 1px solid var(--ws-line); }.member-panel-heading { display: flex; align-items: flex-start; justify-content: space-between; }.member-panel-heading h2 { margin: 5px 0 0; color: var(--ws-fg); font-size: 19px; font-weight: 700; letter-spacing: -.04em; }.member-list { display: flex; flex-direction: column; gap: 17px; margin-top: 17px; }.member-row { display: flex; align-items: center; gap: 8px; min-width: 0; }.member-copy { min-width: 0; flex: 1; }.member-copy strong, .member-copy span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.member-copy strong { color: var(--ws-fg); font-size: 10px; }.member-copy span { margin-top: 4px; color: var(--ws-fg-muted); font-size: 9px; }.member-volume { display: flex; align-items: center; gap: 5px; color: var(--ws-fg-muted); width: 64px; }.member-empty { margin-top: 22px; color: var(--ws-fg-muted); font-size: 10px; text-align: center; }.settings-section { max-width: 620px; margin: 0 auto; }.settings-section h3 { display: flex; align-items: center; gap: 9px; margin: 0 0 21px; color: var(--ws-fg); font-size: 16px; font-weight: 700; }.settings-section h3 .ui-icon { color: var(--ws-accent); }.mic-test { padding: 15px; border: 1px solid var(--ws-line); border-radius: 11px; background: var(--ws-surface-1); }.mic-test-header { display: flex; align-items: center; justify-content: space-between; }.mic-test-header strong { color: var(--ws-fg); font-size: 11px; }.meter { display: flex; align-items: flex-end; justify-content: space-between; gap: 4px; height: 39px; margin-top: 12px; padding: 0 4px 4px; border-bottom: 1px solid var(--ws-line); }.meter i { width: 5px; min-height: 4px; border-radius: 3px 3px 0 0; background: var(--ws-surface-2); }.meter i.active { background: var(--ws-success); box-shadow: 0 0 7px color-mix(in srgb, var(--ws-success) 45%, transparent); animation: meter 1s ease-in-out infinite alternate; }.meter-labels { display: flex; justify-content: space-between; margin-top: 6px; color: var(--ws-fg-muted); font-size: 8px; }.text-button { padding: 0 6px; color: var(--ws-fg-muted); background: transparent; font-size: 11px; font-weight: 600; cursor: pointer; }
@keyframes meter { from { transform: scaleY(.65); } to { transform: scaleY(1); } }

@keyframes join-fade-up { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
@keyframes join-title-in { from { opacity: 0; letter-spacing: -.02em; transform: translateY(18px) scale(.98); } to { opacity: 1; letter-spacing: -.075em; transform: translateY(0) scale(1); } }
@keyframes join-accent-breathe { 0%, 100% { transform: translateY(0); text-shadow: 0 0 0 color-mix(in srgb, var(--ws-accent) 0%, transparent); } 50% { transform: translateY(-2px); text-shadow: 0 5px 18px color-mix(in srgb, var(--ws-accent) 16%, transparent); } }
@keyframes join-accent-breathe-dark { 0%, 100% { transform: translateY(0); text-shadow: 0 0 8px color-mix(in srgb, var(--ws-success) 28%, transparent), 0 0 18px color-mix(in srgb, var(--ws-accent) 14%, transparent); } 50% { transform: translateY(-2px); text-shadow: 0 0 13px color-mix(in srgb, var(--ws-success) 50%, transparent), 0 0 26px color-mix(in srgb, var(--ws-accent) 22%, transparent); } }
@keyframes join-dot-pulse { 0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 color-mix(in srgb, var(--ws-success) 28%, transparent); } 50% { transform: scale(1.18); box-shadow: 0 0 0 6px color-mix(in srgb, var(--ws-success) 0%, transparent); } }
@keyframes visitor-shimmer { 0%, 42% { left: -45%; } 72%, 100% { left: 130%; } }
@keyframes visitor-spark { 0%, 100% { opacity: .58; transform: scale(.88) rotate(0deg); } 50% { opacity: 1; transform: scale(1.14) rotate(12deg); } }
@keyframes visitor-orbit { 0%, 100% { transform: rotate(-8deg) scale(.96); opacity: .48; } 50% { transform: rotate(12deg) scale(1.04); opacity: .9; } }

.join-page .join-header { animation: join-fade-up .55s cubic-bezier(.22, 1, .36, 1) both; }
.join-page .join-copy .eyebrow { animation: join-fade-up .55s .08s cubic-bezier(.22, 1, .36, 1) both; }
.join-page .join-copy h1 { animation: join-title-in .78s .16s cubic-bezier(.22, 1, .36, 1) both; }
.join-page .join-copy h1 em { display: inline-block; animation: join-accent-breathe 5s 1.15s ease-in-out infinite; }
.join-page .join-description { animation: join-fade-up .58s .36s cubic-bezier(.22, 1, .36, 1) both; }
.join-page .promise-list { animation: join-fade-up .58s .48s cubic-bezier(.22, 1, .36, 1) both; }
.join-page .promise-item:nth-child(2) { animation: join-fade-up .58s .58s cubic-bezier(.22, 1, .36, 1) both; }
.join-page .promise-item:nth-child(3) { animation: join-fade-up .58s .68s cubic-bezier(.22, 1, .36, 1) both; }
.join-page .visitor-count { animation: join-fade-up .58s .76s cubic-bezier(.22, 1, .36, 1) both; }
.join-page .eyebrow-dot { animation: join-dot-pulse 2.8s .8s ease-in-out infinite; }
.join-page .join-card { animation: join-fade-up .68s .24s cubic-bezier(.22, 1, .36, 1) both; }
.join-page .join-footer { animation: join-fade-up .55s .72s cubic-bezier(.22, 1, .36, 1) both; }

@media (prefers-reduced-motion: reduce) {
  .join-page *, .join-page *::before, .join-page *::after { animation: none !important; transition-duration: .01ms !important; }
}

@media (max-width: 1200px) { .app-shell { grid-template-columns: 72px 255px minmax(0, 1fr) 218px; }.workspace-content { width: min(900px, calc(100% - 42px)); }.member-panel { padding-inline: 12px; }.member-volume { display: none; } }
@media (max-width: 980px) { .app-shell { grid-template-columns: 70px 245px minmax(0, 1fr); }.member-panel { display: none; }.join-content { gap: 40px; }.join-card { padding: 28px; } }
@media (max-width: 740px) { .join-header, .join-content, .join-footer { width: min(100% - 32px, 560px); }.join-header { min-height: 70px; }.header-note { display: none; }.join-content { display: flex; flex-direction: column; align-items: stretch; justify-content: center; gap: 35px; padding: 36px 0 48px; }.join-copy h1 { margin-top: 15px; font-size: 45px; }.join-description { font-size: 14px; }.promise-list { gap: 13px; margin-top: 27px; }.promise-item { min-width: 0; flex: 1 1 30%; }.promise-item small { display: none; }.visitor-count { margin-top: 24px; }.join-card { padding: 24px 20px; }.join-footer { min-height: 53px; }.join-footer .footer-spacer { display: none; }.join-footer span:last-child { margin-left: auto; }.field-grid { grid-template-columns: minmax(0, 1fr) 112px; gap: 8px; }.app-shell { display: block; height: 100dvh; }.member-panel { display: none; }.workspace { height: 100%; }.workspace-header { min-height: 61px; padding: 0 15px; }.mobile-brand { display: inline; }.crumb-muted, .breadcrumbs > .ui-icon, .breadcrumbs > strong { display: none; }.workspace-actions { gap: 3px; }.workspace-content { width: calc(100% - 30px); padding-top: 18px; }.voice-section, .chat-panel { margin-top: 25px; }.voice-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }.voice-card { min-height: 143px; }.message-row { max-width: 92%; } }
@media (max-width: 420px) { .join-copy h1 { font-size: 38px; }.promise-list { display: grid; grid-template-columns: 1fr; }.promise-item small { display: block; }.join-card { border-radius: 15px; }.voice-grid { gap: 8px; }.voice-card { padding-inline: 6px; }.section-counter { display: none; } }

/* The connected view keeps only controls that have a working action. The
   channel tree lives with the member list so every channel remains visible
   even when the current user is elsewhere. */
.app-shell { grid-template-columns: minmax(0, 1fr) 318px; }
.workspace { min-width: 0; }
.identity-options { margin-top: 8px; color: var(--ws-fg-muted); font-size: 11px; }
.identity-options summary { width: fit-content; color: var(--ws-accent); cursor: pointer; }
.identity-options[open] summary { margin-bottom: 10px; }
/* Touch target floor: pad the hit box out to 44px tall with a matching negative margin, so the
   disclosure's own footprint (and the gap above the checkbox row it reveals) stays put. */
@media (max-width: 740px) {
  .identity-options summary { margin-block: -15px; padding-block: 15px; }
}
.member-panel { display: flex; flex-direction: column; min-height: 0; padding: 26px 18px 18px; overflow: hidden; }
.member-tree { flex: 1; min-height: 0; margin-top: 18px; padding-right: 3px; overflow-y: auto; }
.member-channel-group { padding: 8px 0 14px; border-bottom: 1px solid var(--ws-line); }
.member-channel-group + .member-channel-group { margin-top: 8px; }
.member-channel-heading { display: flex; align-items: center; gap: 7px; width: 100%; padding: 5px 4px; color: var(--ws-fg-muted); background: transparent; border-radius: 7px; text-align: left; cursor: pointer; }
.member-channel-heading:hover, .member-channel-group.current .member-channel-heading { color: var(--ws-accent); background: var(--ws-accent-soft); }
.member-channel-heading span { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; font-weight: 700; }
.member-channel-heading small { color: var(--ws-fg-muted); font-size: 10px; }
.member-channel-group.current .member-channel-heading small { color: var(--ws-accent); }
.member-channel-group .member-list { gap: 13px; margin: 9px 4px 0 14px; }
.member-volume { display: flex; }
.channel-no-members { margin: 7px 4px 0 31px; color: var(--ws-fg-muted); font-size: 10px; }
.remember-identity { display: flex; align-items: flex-start; gap: 9px; margin-top: 8px; color: var(--ws-fg); cursor: pointer; }
.acceleration-choice { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 8px 0 2px; padding: 10px 11px; color: var(--ws-accent); background: var(--ws-surface-0); border: 1px solid var(--ws-line); border-radius: 10px; }
.acceleration-copy { min-width: 0; }
.acceleration-choice strong, .acceleration-choice small { display: block; }
.acceleration-choice strong { font-size: 11px; font-weight: 800; }
.acceleration-choice small { margin-top: 3px; color: var(--ws-fg-muted); font-size: 10px; line-height: 1.45; }
.remember-identity strong, .remember-identity small { display: block; }
.remember-identity strong { font-size: 11px; font-weight: 700; }
.remember-identity small { margin-top: 3px; color: var(--ws-fg-muted); font-size: 10px; line-height: 1.4; }
.identity-warning { margin: 8px 0 0; color: var(--ws-warning); font-size: 10px; line-height: 1.45; }
.local-servers { display: grid; gap: 8px; margin: 1px 0 5px; }
.local-server-group { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; }
.local-server-group > span { width: 100%; color: var(--ws-fg-muted); font-size: 10px; font-weight: 700; }
.clear-local-button { padding: 0; transition-property: color; color: var(--ws-fg-muted); background: transparent; border: 0; font-size: 10px; cursor: pointer; }
.clear-local-button:hover { color: var(--ws-danger); text-decoration: underline; }
.clear-local-button:focus-visible { outline: 2px solid var(--ws-accent); outline-offset: 2px; border-radius: 2px; }
/* Touch target floor: the footer row is 68px tall, so padding the hit box out to 44px with a
   matching negative margin leaves the tiny text link's own footprint and the row's height unchanged. */
@media (max-width: 740px) {
  .clear-local-button { margin-block: -10px; padding-block: 10px; }
}

/* Increase connected-view typography by 25% while keeping the layout compact. */
.app-shell .breadcrumbs { font-size: 15px; }
.app-shell .section-kicker, .app-shell .section-counter { font-size: 12.5px; }
.app-shell .section-heading h2 { font-size: 25px; }
.app-shell .voice-card > strong { font-size: 15px; }
.app-shell .voice-card > span { font-size: 12.5px; }
.app-shell .more-count { font-size: 17.5px; }
.app-shell .voice-empty { font-size: 13.75px; }
.app-shell .chat-empty strong { font-size: 15px; }
.app-shell .chat-empty span { font-size: 12.5px; }
.app-shell .message-meta strong { font-size: 13.75px; }
.app-shell .message-meta time { font-size: 11.25px; }
.app-shell .message-bubble { font-size: 15px; }
.app-shell .member-panel-heading h2 { font-size: 23.75px; }
.app-shell .member-channel-heading span { font-size: 15px; }
.app-shell .member-channel-heading small { font-size: 12.5px; }
.app-shell .member-copy strong { font-size: 12.5px; }
.app-shell .member-copy span, .app-shell .channel-no-members { font-size: 11.25px; }
.app-shell .member-empty { font-size: 12.5px; }
.settings-body .settings-section h3 { font-size: 20px; }
.settings-body .mic-test-header strong { font-size: 13.75px; }
.settings-body .meter-labels { font-size: 10px; }
.join-page .brand-lockup strong { font-size: 22.5px; }
.join-page .brand-lockup small, .join-page .header-note { font-size: 12.5px; }
.join-page .language-switch { font-size: 12.5px; }
.join-page .eyebrow { font-size: 13.75px; }
.join-page .join-copy h1 { font-size: clamp(52px, 6.6vw, 90px); }
.join-page .join-description { font-size: 21.25px; }
.join-page .promise-item b { font-size: 15px; }
.join-page .promise-item small { font-size: 12.5px; }
.join-page .join-card h2 { font-size: 33.75px; }
.join-page .card-lead { font-size: 16.25px; }
.join-page .visitor-count { font-size: 15px; }
.join-page .notice { font-size: 15px; }
.join-page .join-meta, .join-page .join-footer { font-size: 12.5px; }

@media (min-width: 741px) and (max-width: 980px) { .app-shell { grid-template-columns: minmax(0, 1fr); }.member-panel { display: none; } }
@media (max-width: 980px) { .app-shell { display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) minmax(210px, 35dvh); }.workspace { height: auto; min-height: 0; }.member-panel { display: flex; border-top: 1px solid var(--ws-line); border-left: 0; padding: 16px 18px; }.member-tree { margin-top: 10px; } }
@media (max-width: 740px) { .app-shell { display: grid; grid-template-rows: minmax(0, 1fr) 220px; }.app-shell .section-heading h2 { font-size: 21.25px; }.app-shell .message-bubble { font-size: 13.75px; } }

/* Keep the connected workspace sized to the browser viewport and let the
   workspace and member tree own their scroll areas when the window shrinks. */
:global(html), :global(body), :global(#app) { width: 100%; height: 100dvh; min-height: 0; max-height: 100dvh; }
:global(body) { overflow-x: hidden; overflow-y: auto; }
.web-client { height: 100dvh; min-height: 0; max-height: 100dvh; }
.web-client { overflow: hidden; }
.join-page { height: 100dvh; min-height: 0; overflow-y: auto; }
.app-shell { grid-template-columns: 318px minmax(0, 1fr); height: 100dvh; min-height: 0; max-height: 100dvh; }
.workspace { grid-column: 2; grid-row: 1; min-height: 0; height: 100%; }
.workspace-scroll { min-height: 0; padding-bottom: env(safe-area-inset-bottom, 0px); }
.member-panel { grid-column: 1; grid-row: 1; border-right: 1px solid var(--ws-line); border-left: 0; }
.voice-avatar.speaking { box-shadow: 0 0 0 3px var(--ws-success), 0 0 14px color-mix(in srgb, var(--ws-success) 48%, transparent); }
.chat-panel { min-height: 0; }
.message-list { min-height: clamp(150px, 20dvh, 220px); max-height: min(360px, 42dvh); }
.workspace-content { padding-bottom: 64px; }

@media (max-width: 980px) {
  .app-shell { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) minmax(210px, 35dvh); }
  .workspace { grid-column: 1; grid-row: 1; height: auto; }
  .member-panel { grid-column: 1; grid-row: 2; display: flex; border-top: 1px solid var(--ws-line); border-right: 0; padding: 16px 18px; }
}

@media (max-width: 740px) {
  .app-shell { grid-template-rows: minmax(0, 1fr) 220px; }
}

/* Desktop audio controls live in the member rail so the workspace header
   stays focused on navigation. Mobile keeps its existing controls below the
   voice cards and in the More panel. */
.header-tools { align-items: center; }
.workspace-actions { align-items: center; flex-wrap: nowrap; }
.desktop-audio-dock { display: flex; align-items: center; gap: 9px; flex: 0 0 auto; min-width: 0; margin-top: 12px; padding: 9px; color: var(--ws-fg-muted); background: color-mix(in srgb, var(--ws-accent) 8%, var(--ws-surface-1)); border: 1px solid var(--ws-line); border-radius: 12px; box-shadow: 0 8px 20px color-mix(in srgb, var(--ws-fg) 10%, transparent); }
.desktop-audio-dock-copy { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 3px; }
.desktop-audio-dock-copy strong { overflow: hidden; color: var(--ws-fg); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.desktop-audio-dock-copy span { overflow: hidden; font-size: 10px; line-height: 1.35; text-overflow: ellipsis; white-space: nowrap; }
.desktop-audio-dock-actions { display: flex; align-items: center; gap: 4px; flex: 0 0 auto; }

@media (max-width: 740px) {
  .header-tools { gap: 7px; }
  .header-note { display: none; }
}
.chat-tabs { display: flex; align-items: center; gap: 6px; max-width: 100%; margin-top: 18px; overflow-x: auto; padding-bottom: 3px; }
.chat-tabs button { display: inline-flex; align-items: center; gap: 5px; flex: 0 0 auto; padding: 7px 10px; color: var(--ws-fg-muted); background: var(--ws-surface-0); border: 1px solid transparent; border-radius: 7px; font-size: 11px; cursor: pointer; }
.chat-tabs button:hover { color: var(--ws-accent); background: var(--ws-surface-2); }
.chat-tabs button.active { color: var(--ws-accent); background: var(--ws-accent-soft); border-color: var(--ws-line); font-weight: 700; }
.event-row { display: flex; align-items: baseline; gap: 12px; padding: 9px 10px; color: var(--ws-fg-muted); border-bottom: 1px solid var(--ws-line); font-size: 12px; line-height: 1.45; }
.event-row time { flex: 0 0 auto; color: var(--ws-fg-muted); font-size: 10px; }
.member-panel-heading { align-items: flex-end; }
.member-row { position: relative; padding: 4px 6px; margin: -4px -6px; border-radius: 9px; transition: background .16s ease, box-shadow .16s ease; }
.member-row:hover, .member-row:focus-within { background: var(--ws-surface-2); box-shadow: var(--shadow-sm); }
.test-audio { display: block; width: 100%; height: 34px; margin-top: 11px; }

.web-client { background: var(--ws-surface-0); color: var(--ws-fg); }
.join-page { background-color: var(--ws-surface-0); color: var(--ws-fg); }
.join-page .join-card { position: relative; }
.app-shell, .workspace { background: var(--ws-surface-1); }
.workspace-header, .member-panel, .voice-card { background: var(--ws-surface-1); border-color: var(--ws-line); }
.workspace-header { border-bottom-color: var(--ws-line); }
.workspace-content { color: var(--ws-fg); }
.join-card { background: color-mix(in srgb, var(--ws-surface-1) 92%, transparent); border-color: var(--ws-line); }
.message-composer { background: var(--ws-surface-2); }
.voice-card, .member-panel { box-shadow: 0 7px 18px color-mix(in srgb, var(--ws-fg) 8%, transparent); }
.section-heading h2, .join-card h2, .member-panel-heading h2, .message-meta strong, .member-copy strong { color: var(--ws-fg); }
.section-kicker, .header-note, .section-counter, .message-meta time, .member-copy span, .chat-empty, .join-description, .card-lead { color: var(--ws-fg-muted); }
.chat-panel, .chat-heading { border-color: var(--ws-line); }
.message-bubble { color: var(--ws-fg); background: var(--ws-surface-2); }
.settings-section h3 { color: var(--ws-fg); }
.meter i { background: var(--ws-line); }
.member-row:hover, .member-row:focus-within { background: color-mix(in srgb, var(--ws-accent) 10%, var(--ws-surface-1)); box-shadow: 0 4px 12px color-mix(in srgb, var(--ws-fg) 8%, transparent); }
:global(button:focus-visible), :global(a:focus-visible), :global(input:focus-visible), :global(select:focus-visible), :global(textarea:focus-visible) { outline: 3px solid color-mix(in srgb, var(--ws-accent) 55%, transparent); outline-offset: 2px; }
.message-composer { position: sticky; bottom: env(safe-area-inset-bottom, 0px); z-index: 3; }
@media (max-width: 740px) { .workspace-scroll { overscroll-behavior: contain; }.workspace-content { width: min(100% - 24px, 650px); padding-bottom: calc(24px + env(safe-area-inset-bottom, 0px)); }.message-composer { margin-bottom: 8px; } }



/* M007 whisper target controls and M008 mobile navigation. */
.whisper-strip { display: flex; align-items: center; gap: 12px; margin-top: 18px; padding: 12px 14px; color: var(--ws-fg-muted); border: 1px solid var(--ws-line); border-radius: 10px; background: var(--ws-surface-0); }
.whisper-strip-copy { display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1; }
.whisper-strip-copy strong { display: inline-flex; align-items: center; gap: 6px; color: var(--ws-accent); font-size: 12px; white-space: nowrap; }
.whisper-strip-copy span { overflow: hidden; color: var(--ws-fg-muted); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.whisper-ptt-button { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 36px; padding: 0 12px; color: var(--ws-accent-fg); background: var(--ws-accent); border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer; touch-action: none; user-select: none; }
.whisper-ptt-button.active { background: var(--ws-success); box-shadow: 0 0 0 4px color-mix(in srgb, var(--ws-success) 16%, transparent); }
.mobile-nav, .mobile-more-panel { display: none; }
.mobile-section-hidden { display: block; }

@media (min-width: 741px) {
  .app-shell .mobile-section-hidden { display: block; }
}

@media (max-width: 740px) {
  .app-shell { display: flex; flex-direction: column; height: auto; min-height: 100dvh; max-height: none; padding-bottom: calc(68px + env(safe-area-inset-bottom, 0px)); overflow: visible; }
  .app-shell .workspace { display: flex; flex: 1 1 auto; height: calc(100dvh - 61px); min-height: 0; }
  .app-shell .workspace-scroll { flex: 1; height: 100%; min-height: 0; overflow-y: auto; }
  .app-shell .mobile-section-hidden { display: none; }
  .app-shell.mobile-view-more .workspace { display: none; }
  .app-shell .member-panel { display: none !important; order: 2; width: 100%; max-height: calc(100dvh - 142px); min-height: 235px; padding: 18px 15px 24px; border-top: 1px solid var(--ws-line); border-right: 0; overflow: hidden; }
  .app-shell .member-panel.mobile-section-visible { display: flex !important; }
  .app-shell .member-panel .member-tree { max-height: none; }
  .mobile-more-panel { display: grid; gap: 10px; width: min(100% - 30px, 650px); margin: 26px auto 0; padding: 20px; border: 1px solid var(--ws-line); border-radius: 14px; background: var(--ws-surface-1); box-shadow: 0 7px 18px color-mix(in srgb, var(--ws-fg) 8%, transparent); }
  .mobile-more-panel h2 { margin: 0 0 8px; color: var(--ws-fg); font-size: 24px; font-weight: 700; }
  .mobile-nav { position: fixed; z-index: 30; right: 0; bottom: 0; left: 0; display: flex; min-height: 68px; padding: 6px 8px calc(6px + env(safe-area-inset-bottom, 0px)); background: color-mix(in srgb, var(--ws-surface-1) 94%, transparent); border-top: 1px solid var(--ws-line); box-shadow: 0 -7px 20px color-mix(in srgb, var(--ws-fg) 8%, transparent); backdrop-filter: blur(14px); }
  .whisper-strip { align-items: stretch; flex-wrap: wrap; gap: 8px; }
  .whisper-strip-copy { width: 100%; flex: 1 0 100%; }
  .whisper-ptt-button { flex: 1; min-height: 46px; }
  .whisper-strip > .text-button { min-height: 38px; }
}

/* Keep the desktop join card comfortable without making the welcome page
   taller than the browser. Smaller viewports can scroll inside the card. */
@media (min-width: 741px) {
  .join-header { min-height: 72px; }
  .join-content { padding: 28px 0 36px; }
  .join-card { max-height: calc(100dvh - 190px); overflow-y: auto; }
  .join-footer { min-height: 54px; }
}

@media (max-width: 740px) {
  .join-card { max-height: none; overflow: visible; }
}

/* The document itself never becomes the scroll surface. Each view owns its
   content scroll area so headers, controls and mobile navigation stay fixed. */
:global(html), :global(body), :global(#app) { width: 100%; height: 100dvh; min-height: 0; max-height: 100dvh; overflow: hidden; }
.join-page { height: 100dvh; min-height: 0; overflow: hidden; }
.join-content { min-height: 0; overflow-y: auto; }

/* Desktop zoom compensation. main.ts sets --ui-scale (>1 only on large
   viewports) and App.vue applies zoom:var(--ui-scale) on #app. html/body stay
   pinned to the real viewport (100dvh) while the zoomed roots divide their
   height by the scale so the rendered result lands on exactly one viewport.
   Without this a 2K/4K viewport would render a 1.5x-tall shell, clipping the
   bottom of the workspace and leaving blank space under the control dock.
   Non-zero fixed offsets (poke banner stack, in the template) are divided back to CSS pixels
   because zoom also scales fixed coordinates against the viewport. */
@media (min-width: 851px) {
  :global(html), :global(body) { height: 100dvh; max-height: 100dvh; }
  :global(#app), .web-client, .join-page, .app-shell { height: calc(100dvh / var(--ui-scale)); min-height: 0; max-height: calc(100dvh / var(--ui-scale)); }
}

@media (max-width: 740px) {
  .join-content { overflow-y: auto; }
  .app-shell { height: 100dvh; min-height: 0; max-height: 100dvh; padding-bottom: calc(74px + env(safe-area-inset-bottom, 0px)); overflow: hidden; }
  .app-shell .workspace { height: auto; min-height: 0; flex: 1 1 auto; }
  .app-shell.mobile-view-channels .workspace { display: none; }
  .app-shell .member-panel.mobile-section-visible { flex: 1 1 auto; min-height: 0; max-height: none; }
  .mobile-more-panel { min-height: 0; max-height: none; margin-bottom: 0; overflow-y: auto; }
}

/* Match every native scroll surface to the WebSpeak palette. */
:global(*) { scrollbar-color: var(--ws-line-strong) transparent; scrollbar-width: thin; }
:global(*::-webkit-scrollbar) { width: 8px; height: 8px; }
:global(*::-webkit-scrollbar-track) { background: transparent; }
:global(*::-webkit-scrollbar-thumb) { background: var(--ws-line-strong); background-clip: padding-box; border: 2px solid transparent; border-radius: 999px; }
:global(*::-webkit-scrollbar-thumb:hover) { background: var(--ws-fg-muted); background-clip: padding-box; border-width: 1px; }

/* Mobile interaction pass: keep the browser viewport fixed and give each
   mobile surface its own touch-friendly scroll area. */
.mobile-voice-controls, .voice-member-action, .member-action-button { display: none; }

@media (max-width: 740px) {
  :global(html), :global(body), :global(#app) { height: 100dvh; height: 100svh; min-height: 100dvh; min-height: 100svh; max-height: 100dvh; max-height: 100svh; }
  .web-client { height: 100dvh; height: 100svh; min-height: 100dvh; min-height: 100svh; max-height: 100dvh; max-height: 100svh; }
  .app-shell { height: 100dvh; height: 100svh; min-height: 100dvh; min-height: 100svh; max-height: 100dvh; max-height: 100svh; padding-bottom: calc(74px + env(safe-area-inset-bottom, 0px)); overflow: hidden; }
  .app-shell .workspace { height: calc(100dvh - 74px - env(safe-area-inset-bottom, 0px)); height: calc(100svh - 74px - env(safe-area-inset-bottom, 0px)); min-height: 0; max-height: calc(100dvh - 74px - env(safe-area-inset-bottom, 0px)); max-height: calc(100svh - 74px - env(safe-area-inset-bottom, 0px)); overflow: hidden; }
  .app-shell .workspace-scroll { height: 100%; min-height: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-gutter: stable; }
  .workspace-header { min-height: calc(60px + env(safe-area-inset-top, 0px)); padding: env(safe-area-inset-top, 0px) 14px 0; box-sizing: border-box; position: sticky; top: 0; z-index: 6; background: color-mix(in srgb, var(--ws-surface-1) 94%, transparent); backdrop-filter: blur(14px); }
  .breadcrumbs { flex: 1 1 auto; min-width: 0; gap: 6px; font-size: 13px; }
  .breadcrumbs .crumb-muted, .breadcrumbs > .ui-icon { display: none; }
  .mobile-brand { display: inline; font-size: 18px; }
  .workspace-actions { flex: 0 0 auto; gap: 3px; }
  .workspace-actions .workspace-language { display: none; }
  .workspace-content { display: block; width: 100%; max-width: none; min-height: 100%; margin: 0; padding: 14px 14px calc(18px + env(safe-area-inset-bottom, 0px)); box-sizing: border-box; }
  .voice-section { margin-top: 21px; }
  .section-heading { gap: 10px; }
  .section-heading h2 { font-size: 22px; }
  .voice-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 14px; }
  .voice-card { position: relative; min-height: 136px; padding: 18px 8px 14px; border-radius: 16px; }
  .voice-avatar-wrap, .voice-avatar { width: 60px; height: 60px; }
  .voice-avatar-wrap { margin-bottom: 10px; }
  .voice-avatar { font-size: 18px; }
  .app-shell .voice-card > strong { max-width: 100%; font-size: 14px; }
  .app-shell .voice-card > span { margin-top: 4px; font-size: 11px; }
  .voice-member-action { position: absolute; top: 7px; right: 7px; display: grid; place-items: center; width: 34px; height: 34px; color: var(--ws-fg-muted); background: color-mix(in srgb, var(--ws-surface-2) 78%, transparent); border-radius: 10px; cursor: pointer; }
  .voice-member-action:hover, .voice-member-action:active { color: var(--ws-accent); background: color-mix(in srgb, var(--ws-accent) 14%, var(--ws-surface-1)); }
  .mobile-voice-controls { display: flex; align-items: stretch; gap: 8px; margin-top: 14px; padding: 8px; background: var(--ws-surface-2); border: 1px solid var(--ws-line); border-radius: 14px; }
  .mobile-voice-toggle, .mobile-voice-settings { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 44px; min-width: 0; padding: 0 11px; color: var(--ws-accent); background: var(--ws-surface-1); border: 1px solid var(--ws-line); border-radius: 10px; font-size: 12px; font-weight: 700; cursor: pointer; }
  .mobile-voice-toggle { flex: 1 1 auto; }
  .mobile-voice-toggle.muted { color: var(--ws-danger); }
  .mobile-voice-settings { flex: 0 0 auto; width: 82px; }
  .mobile-voice-settings span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .app-shell .member-panel.mobile-section-visible { display: flex !important; flex: 1 1 auto; width: 100%; height: auto; min-height: 0; max-height: none; padding: 18px 14px 16px; border-top: 0; border-right: 0; overflow: hidden; }
  .member-panel-heading { flex: 0 0 auto; }
  .member-panel-heading h2 { font-size: 23px; }
  .app-shell .member-panel .member-tree { flex: 1 1 auto; min-height: 0; max-height: none; margin-top: 12px; padding: 0 2px 4px 0; overflow-y: auto; scrollbar-gutter: stable; }
  .member-channel-group { padding: 7px 0 12px; }
  .member-channel-heading { min-height: 44px; padding: 0 9px; border-radius: 11px; font-size: 14px; }
  .member-channel-heading small { font-size: 12px; }
  .member-list { gap: 3px; margin-top: 5px; }
  .member-row { min-height: 58px; margin: 0; padding: 7px 7px; gap: 9px; border-radius: 12px; }
  .member-copy strong { font-size: 14px; }
  .member-copy span { margin-top: 3px; font-size: 12px; }
  .desktop-audio-dock, .member-flags, .member-volume { display: none; }
  .member-action-button { display: grid; place-items: center; width: 38px; height: 38px; flex: 0 0 38px; color: var(--ws-fg-muted); background: transparent; border-radius: 10px; cursor: pointer; }
  .member-action-button:hover, .member-action-button:active { color: var(--ws-accent); background: color-mix(in srgb, var(--ws-accent) 14%, var(--ws-surface-1)); }

  .app-shell.mobile-view-chat .workspace-scroll { overflow: hidden; }
  .app-shell.mobile-view-chat .workspace-content { display: flex; flex-direction: column; height: 100%; min-height: 0; padding: 0 14px calc(8px + env(safe-area-inset-bottom, 0px)); }
  .app-shell.mobile-view-chat .chat-panel { display: flex; flex: 1 1 auto; flex-direction: column; min-height: 0; margin-top: 0; padding: 0; border-top: 0; }
  .app-shell.mobile-view-chat .chat-tabs { flex: 0 0 auto; margin-top: 0; padding: 10px 0 9px; border-bottom: 1px solid var(--ws-line); scrollbar-width: none; }
  .app-shell.mobile-view-chat .chat-tabs::-webkit-scrollbar { display: none; }
  .app-shell.mobile-view-chat .chat-heading { flex: 0 0 auto; padding: 13px 0 9px; }
  .app-shell.mobile-view-chat .chat-heading h2 { font-size: 21px; }
  .app-shell.mobile-view-chat .message-list { flex: 1 1 auto; min-height: 0; max-height: none; padding: 10px 2px 16px; overflow-y: auto; overscroll-behavior: contain; }
  .app-shell.mobile-view-chat .message-row { max-width: 94%; gap: 9px; }
  .app-shell.mobile-view-chat .message-meta strong { font-size: 12px; }
  .app-shell.mobile-view-chat .message-bubble { padding: 10px 12px; font-size: 14px; }
  .app-shell.mobile-view-chat .message-composer { position: relative; flex: 0 0 auto; min-height: 54px; margin: 0 0 4px; padding: 7px 8px 7px 13px; border: 1px solid var(--ws-line); }

  .mobile-more-panel { width: calc(100% - 28px); max-height: none; margin: 16px auto 0; padding: 18px; border-radius: 18px; overflow-y: auto; }
  .mobile-more-panel h2 { font-size: 25px; }
  .mobile-nav { min-height: 74px; padding: 8px 8px calc(8px + env(safe-area-inset-bottom, 0px)); }

  .join-page { height: 100dvh; height: 100svh; min-height: 100dvh; min-height: 100svh; max-height: 100dvh; max-height: 100svh; }
  .join-header { min-height: calc(62px + env(safe-area-inset-top, 0px)); padding-top: env(safe-area-inset-top, 0px); box-sizing: border-box; }
  .join-content { align-items: stretch; justify-content: flex-start; gap: 24px; width: min(100% - 28px, 560px); padding: 24px 0 28px; overflow-y: auto; }
  .join-copy h1 { margin: 14px 0 14px; font-size: clamp(40px, 12vw, 58px); }
  .join-description { font-size: 15px; line-height: 1.65; }
  .promise-list { margin-top: 23px; }
  .join-card { padding: 22px 18px; border-radius: 18px; }
  .join-card h2 { font-size: 25px; }
  .field-grid { grid-template-columns: minmax(0, 1fr) 112px; }
  .join-footer { width: min(100% - 28px, 560px); }
}

@media (max-width: 390px) {
  .join-page .header-tools { gap: 4px; }
  .workspace-header { padding-inline: 10px; }
  .mobile-voice-settings { width: 56px; padding-inline: 4px; }
  .mobile-voice-toggle { flex: 0 0 44px; padding-inline: 0; }
  .mobile-voice-toggle span { display: none; }
  .mobile-voice-settings span { display: none; }
  .join-content { gap: 18px; }
  .join-card { padding-inline: 15px; }
}

/* Keep every welcome-page action inside the viewport on narrow phones. */
@media (max-width: 420px) {
  .join-page .join-header { width: calc(100% - 20px); gap: 6px; }
  .join-page .brand-lockup { min-width: 0; flex: 1 1 auto; gap: 7px; }
  .join-page .brand-mark { width: 32px; height: 32px; border-radius: 9px; }
  .join-page .brand-lockup strong { overflow: hidden; font-size: 15px; text-overflow: ellipsis; white-space: nowrap; }
  .join-page .brand-lockup small { display: none; }
  .join-page .header-tools { min-width: 0; flex: 0 0 auto; gap: 2px; }
  .join-page .language-switcher { min-width: 58px; }
}

@media (max-width: 360px) {
  .join-page .brand-lockup > div { display: none; }
  .join-page .brand-lockup { flex: 0 0 32px; }
}



.network-performance { position: relative; z-index: 8; }
.performance-panel { position: absolute; top: calc(100% + 10px); right: 0; width: 330px; padding: 15px; color: var(--ws-fg); background: var(--ws-surface-1); border: 1px solid var(--ws-line); border-radius: 13px; box-shadow: 0 16px 36px color-mix(in srgb, var(--ws-fg) 18%, transparent); }
.performance-panel header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.performance-panel header strong, .performance-panel header small { display: block; }
.performance-panel header strong { font-size: 13px; }
.performance-panel header small { max-width: 255px; margin-top: 4px; color: var(--ws-fg-muted); font-size: 10px; line-height: 1.45; }
.performance-refresh { display: grid; place-items: center; width: 28px; height: 28px; flex: 0 0 28px; color: var(--ws-accent); background: var(--ws-surface-2); border: 1px solid var(--ws-line); border-radius: 7px; cursor: pointer; }
.performance-refresh:disabled { cursor: wait; opacity: .55; }
.performance-route { display: flex; align-items: center; gap: 6px; margin: 15px 0 11px; color: var(--ws-fg-muted); font-size: 9px; }
.performance-route span { padding: 4px 6px; background: var(--ws-surface-2); border-radius: 5px; white-space: nowrap; }
.performance-route i { width: 18px; height: 1px; flex: 1; background: var(--ws-accent); opacity: .55; }
.performance-metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.performance-metrics article { min-width: 0; padding: 10px; background: var(--ws-surface-2); border: 1px solid var(--ws-line); border-radius: 9px; }
.performance-metrics small, .performance-metrics strong, .performance-metrics span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.performance-metrics small { color: var(--ws-fg-muted); font-size: 9px; }
.performance-metrics strong { margin-top: 6px; color: var(--ws-accent); font-size: 18px; }
.performance-metrics span { margin-top: 4px; color: var(--ws-fg-muted); font-size: 9px; }
.performance-status { margin: 11px 0 0; color: var(--ws-fg-muted); font-size: 10px; }
.webrtc-stats { margin-top: 13px; padding-top: 12px; border-top: 1px solid var(--ws-line); }
.webrtc-stats > header { display: block; margin-bottom: 8px; }
.webrtc-stats > header strong, .webrtc-stats > header small { display: block; }
.webrtc-stats > header strong { font-size: 11px; }
.webrtc-stats > header small { margin-top: 3px; color: var(--ws-fg-muted); font-size: 9px; }
.webrtc-stats-capture, .webrtc-stats-peer { padding: 8px 9px; background: var(--ws-surface-2); border: 1px solid var(--ws-line); border-radius: 8px; }
.webrtc-stats-capture { display: flex; align-items: baseline; gap: 7px; margin-bottom: 7px; }
.webrtc-stats-capture span, .webrtc-stats-capture small, .webrtc-stats-peer-heading small, .webrtc-stats-detail { color: var(--ws-fg-muted); font-size: 9px; }
.webrtc-stats-capture strong { margin-left: auto; color: var(--ws-accent); font-size: 11px; }
.webrtc-stats-peer + .webrtc-stats-peer { margin-top: 7px; }
.webrtc-stats-peer-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.webrtc-stats-peer-heading strong { font-size: 10px; }
.webrtc-stats-peer-heading small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.webrtc-stats-values { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 8px; margin-top: 7px; color: var(--ws-accent); font-size: 10px; font-variant-numeric: tabular-nums; }
.webrtc-stats-detail { display: block; margin-top: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Latin-script translations need a little more room than Chinese copy. Keep
   the Chinese layout unchanged and use a compact type scale for English and
   German so headings, labels, and actions do not force awkward wrapping. */
.web-client.language-en .join-page .brand-lockup strong,
.web-client.language-de .join-page .brand-lockup strong { font-size: 19.8px; }
.web-client.language-en .join-page .brand-lockup small,
.web-client.language-en .join-page .header-note,
.web-client.language-de .join-page .brand-lockup small,
.web-client.language-de .join-page .header-note { font-size: 11px; }
.web-client.language-en .join-page .eyebrow,
.web-client.language-de .join-page .eyebrow { font-size: 12px; }
.web-client.language-en .join-page .join-copy h1,
.web-client.language-de .join-page .join-copy h1 { font-size: clamp(46px, 5.8vw, 79px); }
.web-client.language-en .join-page .join-description,
.web-client.language-de .join-page .join-description { font-size: 18px; }
.web-client.language-en .join-page .promise-item b,
.web-client.language-de .join-page .promise-item b { font-size: 13.2px; }
.web-client.language-en .join-page .promise-item small,
.web-client.language-de .join-page .promise-item small { font-size: 11px; }
.web-client.language-en .join-page .join-card h2,
.web-client.language-de .join-page .join-card h2 { font-size: 29.7px; }
.web-client.language-en .join-page .card-lead,
.web-client.language-de .join-page .card-lead { font-size: 14.3px; }
.web-client.language-en .join-page .notice,
.web-client.language-de .join-page .notice { font-size: 13.2px; }
.web-client.language-en .join-page .join-meta,
.web-client.language-en .join-page .join-footer,
.web-client.language-de .join-page .join-meta,
.web-client.language-de .join-page .join-footer { font-size: 11px; }

@media (max-width: 740px) {
  .web-client.language-en .join-page .join-copy h1,
  .web-client.language-de .join-page .join-copy h1 { font-size: clamp(35px, 10.6vw, 51px); }
  .web-client.language-en .join-page .join-description,
  .web-client.language-de .join-page .join-description { font-size: 13.2px; }
  .web-client.language-en .join-page .join-card h2,
  .web-client.language-de .join-page .join-card h2 { font-size: 22px; }
  .web-client.language-en .join-page .card-lead,
  .web-client.language-de .join-page .card-lead { font-size: 13px; }
}

@media (max-width: 420px) {
  .web-client.language-en .join-page .brand-lockup strong,
  .web-client.language-de .join-page .brand-lockup strong { font-size: 13.2px; }
}

@media (max-width: 740px) {
  .performance-panel { position: fixed; top: calc(60px + env(safe-area-inset-top, 0px)); right: 10px; width: min(340px, calc(100vw - 20px)); }
}

@media (max-width: 390px) {
  .performance-panel { right: 8px; width: min(330px, calc(100vw - 16px)); padding: 13px; }
  .performance-route { gap: 3px; }
  .performance-route span { padding-inline: 4px; font-size: 8px; }
}

/* Desktop audio popovers: keep the rail compact and reveal each control's
   adjustment surface only while the pointer or keyboard focus is on it. */
@media (min-width: 741px) {
  /* 桌面端悬浮（仅 ≥741px 生效，≤740px 移动端布局不受影响）：
     1) 桌面控制坞 .desktop-audio-dock 脱离文档流悬浮于成员面板底部，
        仍浮在原布局位置（距面板底 18px），宽度跟随面板内容宽度
        （left/right 各留 18px，与 member-panel 水平内边距一致，
        随列宽自适应伸缩）；高度仍由内容撑起。member-panel 作为
        absolute 包含块并加 padding-bottom 补偿原占位，避免成员列表
        被遮挡。
     2) 消息输入框 .message-composer 脱离文档流悬浮于聊天面板底部，
        宽度跟随聊天面板内容宽度（chat-panel 水平内边距为 0，
        left/right:0 即与内容宽度完全一致）；chat-panel 作为包含块
        并加 padding-bottom 补偿原占位，避免消息列表被遮挡。 */
  .app-shell .member-panel { position: relative; overflow: visible; padding-bottom: calc(18px + 12px + 52px); }
  .desktop-audio-dock { position: absolute; z-index: 6; left: 18px; right: 18px; bottom: 18px; margin-top: 0; }
  .app-shell .chat-panel { position: relative; padding-bottom: calc(16px + 48px); }
  .app-shell .message-composer { position: absolute; z-index: 3; left: 0; right: 0; bottom: 16px; margin-bottom: 0; }
}

.dock-hover-control { position: relative; flex: 0 0 34px; }
.dock-hover-panel {
  position: absolute;
  z-index: 20;
  right: 50%;
  bottom: calc(100% + 10px);
  width: min(224px, calc(100vw - 32px));
  padding: 13px 14px;
  color: var(--ws-fg);
  background: var(--ws-surface-1);
  border: 1px solid var(--ws-line);
  border-radius: 12px;
  box-shadow: 0 15px 34px color-mix(in srgb, var(--ws-fg) 18%, transparent);
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transform: translate(50%, 6px);
  transition: opacity .16s ease, transform .16s ease, visibility .16s ease;
}
.dock-hover-panel::after { content: ""; position: absolute; right: auto; bottom: -6px; left: 50%; width: 10px; height: 10px; background: var(--ws-surface-1); border-right: 1px solid var(--ws-line); border-bottom: 1px solid var(--ws-line); transform: translateX(-50%) rotate(45deg); }
.dock-hover-control:hover .dock-hover-panel,
.dock-hover-control:focus-within .dock-hover-panel { opacity: 1; visibility: visible; pointer-events: auto; transform: translate(50%, 0); }
.dock-microphone-panel { width: min(246px, calc(100vw - 32px)); }

.member-row[draggable="true"] { cursor: grab; touch-action: none; }
.member-row[draggable="true"]:active { cursor: grabbing; }
.member-row.dragging { opacity: .45; }
.member-channel-group.drag-over { padding: 6px 6px 12px; border: 1px dashed var(--ws-accent); border-radius: 10px; background: color-mix(in srgb, var(--ws-accent) 7%, transparent); }
.member-channel-group.drag-over .member-channel-heading { color: var(--ws-accent); background: color-mix(in srgb, var(--ws-accent) 13%, var(--ws-surface-1)); }

@media (prefers-reduced-motion: reduce) {
  .dock-hover-panel { transition-duration: .01ms; }
}

.screen-share-inline-error { display: flex; align-items: center; gap: 7px; margin: 10px 0 0; padding: 8px 10px; color: var(--ws-danger); border: 1px solid color-mix(in srgb, var(--ws-danger) 28%, var(--ws-line)); border-radius: 9px; background: color-mix(in srgb, var(--ws-danger-soft) 45%, var(--ws-surface-1)); font-size: 10px; line-height: 1.4; }
.screen-share-avatar-wrap { position: relative; overflow: visible; }
.screen-share-live-indicator { position: absolute; top: -16px; right: 50%; z-index: 2; display: inline-flex; align-items: center; gap: 4px; min-height: 17px; padding: 3px 6px 3px 4px; color: var(--ws-accent); border: 1px solid color-mix(in srgb, var(--ws-accent) 28%, var(--ws-line)); border-radius: 999px; background: var(--ws-surface-1); box-shadow: 0 4px 12px color-mix(in srgb, var(--ws-fg) 12%, transparent); font-size: 8px; font-weight: 800; line-height: 1; white-space: nowrap; transform: translateX(50%); }
.screen-share-live-indicator::before { content: ""; width: 5px; height: 5px; flex: 0 0 5px; border-radius: 50%; background: var(--ws-success); box-shadow: 0 0 0 3px color-mix(in srgb, var(--ws-success) 18%, transparent); animation: screen-share-live-dot 1.2s ease-in-out infinite; }
.screen-share-wave { display: inline-flex; align-items: center; gap: 1px; height: 14px; color: var(--ws-accent); }
.screen-share-wave i { display: block; width: 2px; flex: 0 0 2px; border-radius: 99px; background: currentColor; animation: screen-share-wave 1.1s ease-in-out infinite alternate; }
.screen-share-wave i:nth-child(2n) { animation-delay: -.18s; }
.screen-share-wave i:nth-child(3n) { animation-delay: -.42s; }
.screen-share-wave i:nth-child(4n) { animation-delay: -.66s; }
.screen-share-stop-button { position: absolute; bottom: -4px; left: -5px; z-index: 3; display: grid; place-items: center; width: 24px; height: 24px; padding: 0; color: var(--ws-danger); border: 2px solid var(--ws-surface-1); border-radius: 7px; background: var(--ws-surface-2); box-shadow: 0 3px 9px color-mix(in srgb, var(--ws-fg) 18%, transparent); cursor: pointer; }
.screen-share-stop-button:hover { color: var(--ws-accent-fg); border-color: var(--ws-danger); background: var(--ws-danger); }
.screen-share-stop-button:focus-visible { outline: 3px solid color-mix(in srgb, var(--ws-danger) 42%, transparent); outline-offset: 2px; }
.screen-share-card-actions { display: flex; align-items: center; justify-content: center; gap: 5px; width: 100%; min-width: 0; margin-top: 9px; flex-wrap: wrap; }
.screen-share-start-actions { display: inline-flex; align-items: stretch; justify-content: center; gap: 4px; width: 100%; min-width: 0; }
.screen-share-card-button { display: inline-flex; align-items: center; justify-content: center; gap: 4px; min-width: 0; min-height: 25px; max-width: 100%; padding: 4px 7px; overflow: hidden; color: var(--ws-accent); border: 1px solid color-mix(in srgb, var(--ws-accent) 25%, var(--ws-line)); border-radius: 999px; background: color-mix(in srgb, var(--ws-accent) 8%, var(--ws-surface-1)); font-size: 9px; font-weight: 700; line-height: 1.2; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
.screen-share-card-button:hover { background: color-mix(in srgb, var(--ws-accent) 15%, var(--ws-surface-1)); }
.screen-share-card-button.viewing { color: var(--ws-accent-fg); border-color: var(--ws-accent); background: var(--ws-accent); }
.screen-share-settings-button { display: grid; place-items: center; width: 25px; min-width: 25px; min-height: 25px; padding: 0; color: var(--ws-fg-muted); border: 1px solid var(--ws-line); border-radius: 50%; background: var(--ws-surface-1); cursor: pointer; }
.screen-share-settings-button:hover, .screen-share-settings-button[aria-expanded="true"] { color: var(--ws-accent); border-color: color-mix(in srgb, var(--ws-accent) 35%, var(--ws-line)); background: color-mix(in srgb, var(--ws-accent) 9%, var(--ws-surface-1)); }
/* style-budget: allow screen-share-player */
.screen-share-player { position: relative; margin-top: 17px; overflow: hidden; border: 1px solid #263b37; border-radius: 18px; background: #070d0d; box-shadow: 0 12px 30px color-mix(in srgb, var(--ws-fg) 18%, transparent); }
.screen-share-player-stage { position: relative; display: grid; width: 100%; min-height: 245px; aspect-ratio: 16 / 9; place-items: center; overflow: hidden; background: radial-gradient(circle at 50% 40%, #1d3934, #091010 68%); }
.screen-share-player-video { display: block; width: 100%; height: 100%; object-fit: contain; background: #030606; }
.screen-share-player-placeholder { display: flex; align-items: center; flex-direction: column; gap: 10px; max-width: 360px; padding: 30px; color: #b1c2bd; text-align: center; }
.screen-share-player-placeholder-icon { display: grid; place-items: center; width: 58px; height: 58px; color: #69d2c7; border: 1px solid rgba(105,210,199,.36); border-radius: 18px; background: rgba(105,210,199,.12); }
.screen-share-player-placeholder strong { color: #f0f8f5; font-size: 15px; }
.screen-share-player-placeholder > span:last-child { color: #8ea39d; font-size: 10px; line-height: 1.5; }
.screen-share-player-exit, .screen-share-player-controls button { display: grid; place-items: center; width: 38px; height: 38px; padding: 0; color: #edf7f4; border: 1px solid rgba(255,255,255,.14); border-radius: 50%; background: rgba(8,14,14,.7); box-shadow: 0 5px 16px rgba(0,0,0,.22); backdrop-filter: blur(8px); cursor: pointer; }
.screen-share-player-exit { position: absolute; top: 15px; left: 15px; z-index: 3; }
.screen-share-player-exit:hover, .screen-share-player-controls button:hover { color: #fff; border-color: rgba(105,210,199,.75); background: rgba(0,106,100,.85); }
.screen-share-player-viewers { position: absolute; top: 15px; right: 15px; z-index: 3; display: flex; align-items: center; gap: 8px; min-height: 38px; padding: 5px 8px 5px 11px; color: #f3faf8; border: 1px solid rgba(255,255,255,.14); border-radius: 999px; background: rgba(8,14,14,.74); box-shadow: 0 5px 16px rgba(0,0,0,.22); backdrop-filter: blur(8px); }
.screen-share-player-viewer-label { display: inline-flex; align-items: center; gap: 5px; color: #d2e2de; font-size: 10px; font-weight: 700; white-space: nowrap; }
.screen-share-player-viewer-avatars { display: inline-flex; align-items: center; padding-left: 4px; }
.screen-share-player-viewer-avatar { display: grid; place-items: center; width: 25px; height: 25px; margin-left: -4px; color: #fff; border: 2px solid #15211f; border-radius: 50%; font-size: 9px; font-weight: 800; box-shadow: 0 2px 7px rgba(0,0,0,.25); }
.screen-share-player-live { position: absolute; top: 22px; left: 64px; z-index: 3; display: inline-flex; align-items: center; gap: 6px; color: #a7fff0; font-size: 11px; font-weight: 800; text-shadow: 0 2px 8px rgba(0,0,0,.55); }
.screen-share-player-live i { width: 7px; height: 7px; border-radius: 50%; background: #65e48b; box-shadow: 0 0 0 4px rgba(101,228,139,.18); animation: screen-share-live-dot 1.2s ease-in-out infinite; }
.screen-share-player-source { position: absolute; bottom: 18px; left: 18px; z-index: 3; max-width: 45%; overflow: hidden; color: #f5fbf8; font-size: 12px; font-weight: 800; text-overflow: ellipsis; text-shadow: 0 2px 8px rgba(0,0,0,.7); white-space: nowrap; }
.screen-share-player-controls { position: absolute; right: 15px; bottom: 15px; z-index: 3; display: flex; align-items: center; gap: 9px; }
.screen-share-player-volume { display: inline-flex; align-items: center; gap: 8px; min-height: 38px; padding: 0 11px; color: #edf7f4; border: 1px solid rgba(255,255,255,.14); border-radius: 999px; background: rgba(8,14,14,.7); box-shadow: 0 5px 16px rgba(0,0,0,.22); backdrop-filter: blur(8px); }
.screen-share-player:fullscreen { width: 100vw; height: 100vh; border: 0; border-radius: 0; background: #030606; }
.screen-share-player:fullscreen .screen-share-player-stage { height: 100%; max-height: none; aspect-ratio: auto; }
.screen-share-player::backdrop { background: #030606; }
@keyframes screen-share-wave { 0% { transform: scaleY(.45); opacity: .5; } 100% { transform: scaleY(1); opacity: 1; } }
@keyframes screen-share-live-dot { 0%, 100% { opacity: .55; transform: scale(.86); } 50% { opacity: 1; transform: scale(1); } }
@media (max-width: 740px) {
  .screen-share-live-indicator { top: -14px; font-size: 7px; }
  .screen-share-card-button { font-size: 8px; }
  .screen-share-player { margin-top: 14px; border-radius: 14px; }
  .screen-share-player-stage { min-height: 210px; }
  .screen-share-player-viewers { top: 10px; right: 10px; }
  .screen-share-player-live { top: 19px; left: 57px; }
  .screen-share-player-source { bottom: 12px; left: 12px; max-width: 40%; }
  .screen-share-player-controls { right: 10px; bottom: 10px; gap: 6px; }
  .screen-share-player-volume { padding-inline: 9px; }
    .screen-share-player-exit { top: 10px; left: 10px; }
}
/* style-budget: end */
</style>
