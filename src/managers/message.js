const fs = require('fs');
const path = require('path');
const CONSTANTS = require('../constants');

const LUCY_BOT_ID = '1438615298012872817';
const LUCY_TEAM_OUTPUT_PATH = path.join(__dirname, '../../lucy-team-output.txt');
const log = require('../../logger');
const { accountPrefix } = require('../utils');
const statsService = require('../services/stats');

const MESSAGE_DEBUG_LIMIT = 25;

const toJsonValue = (value) => {
    if (value === undefined || value === null) return value;
    try {
        if (typeof value.toJSON === 'function') return value.toJSON();
        return value;
    } catch {
        return '[Tidak dapat diserialisasi ke JSON]';
    }
};

module.exports = (state, configManager, emergencyHandler, loopManager, telegramService, macrodroidService, commandSender, voiceManager, adventureManager, boss2Manager, gemsManager, huntbot2Manager, monsterCatcherManager, dailyManager) => {
    let lucyTeamAwaiting = false;
    let lucyTeamTimeout = null;
    const clearLucyTeamAwaiting = () => {
        lucyTeamAwaiting = false;
        if (lucyTeamTimeout) clearTimeout(lucyTeamTimeout);
        lucyTeamTimeout = null;
    };
    const walkTextDisplays = (nodes, collected = []) => {
        if (!Array.isArray(nodes)) return collected;
        for (const node of nodes) {
            if (!node || typeof node !== 'object') continue;
            if (node.type === 10 && typeof node.content === 'string') collected.push(node.content);
            if (Array.isArray(node.components)) walkTextDisplays(node.components, collected);
        }
        return collected;
    };
    const handleLucyTeamDebug = (msg) => {
        try {
            if (state.config.settings?.debug2 !== true) return;
            const authorId = String(msg.author?.id || '');
            const myId = String(state.client?.user?.id || '');
            if (myId && authorId === myId) {
                const command = String(msg.content || '').trim().toLowerCase();
                if (command === 'ltm' || command === 'lteam' || command === 'lucy team') {
                    if (lucyTeamTimeout) clearTimeout(lucyTeamTimeout);
                    lucyTeamAwaiting = true;
                    lucyTeamTimeout = setTimeout(() => {
                        try { lucyTeamAwaiting = false; lucyTeamTimeout = null; } catch (_) {}
                    }, 20000);
                }
                return;
            }
            if (!lucyTeamAwaiting) return;
            const isLucy = authorId === LUCY_BOT_ID ||
                (msg.author?.bot === true && String(msg.author?.username || '').toLowerCase().includes('lucy'));
            if (!isLucy) return;
            let components = [];
            try {
                const serialized = typeof msg.toJSON === 'function' ? msg.toJSON() : null;
                if (Array.isArray(serialized?.components) && serialized.components.length) components = serialized.components;
            } catch (_) {}
            if (!components.length) {
                try {
                    components = Array.isArray(msg.components) ? msg.components.map(component => {
                        try { return component?.toJSON?.() ?? component; } catch (_) { return component; }
                    }) : [];
                } catch (_) { components = []; }
            }
            const text = walkTextDisplays(components).join('\n');
            const regex = /[🔒🔓][ \t]*`([^`\r\n]+)`/g;
            const teams = [];
            let match;
            while ((match = regex.exec(text)) !== null) teams.push(`${match[0].startsWith('🔒') ? '🔒' : '🔓'} \`${match[1]}\``);
            if (!teams.length) return;
            fs.writeFileSync(LUCY_TEAM_OUTPUT_PATH, teams.join('\n') + '\n', 'utf8');
            clearLucyTeamAwaiting();
        } catch (_) {}
    };
    return ({
    async handleUpdate(msg) {
        if (!state.client?.isReady()) return;
        try {
            if (msg.partial) msg = await msg.fetch();
            if (boss2Manager) await boss2Manager.handle(msg);
            if (monsterCatcherManager && typeof monsterCatcherManager.handle === 'function') {
                await monsterCatcherManager.handle(msg);
            }
        } catch (error) {
            log.error(`${accountPrefix(state)}Gagal memproses edit pesan: ${error.message}`);
        }
    },

    async handle(msg) {
        if (!state.client?.isReady()) return;

        // Deteksi cooldown global Lucy sebelum handler fitur memproses pesan yang sama.
        if (commandSender?.handleLucyCooldownMessage) commandSender.handleLucyCooldownMessage(msg);
        handleLucyTeamDebug(msg);
        this.captureMessageDebug(msg);

        // Monster Catcher: mendeteksi sensor dan respons DM dari Bot Lucy.
        if (monsterCatcherManager && typeof monsterCatcherManager.handle === 'function') {
            await monsterCatcherManager.handle(msg);
        }
        if (huntbot2Manager && typeof huntbot2Manager.handle === 'function') {
            await huntbot2Manager.handle(msg);
        }
        await this.handleControlCommands(msg);

        // ✅ FITUR BARU: Deteksi SEMUA pesan dari admin/orang lain di channel aktif
        await this.handleUserMessages(msg);

        // Adventure adalah automasi mandiri.
        if (adventureManager) await adventureManager.handle(msg);

        // Boss2 menjadi satu-satunya jalur deteksi, Fight, dan konfirmasi tiket Guild.
        if (boss2Manager) await boss2Manager.handle(msg);

        if (gemsManager) await gemsManager.handle(msg);

        // Daily Lucy: menangkap balasan "streak harianmu xx hari!" dari Lucy.
        if (dailyManager && typeof dailyManager.handle === 'function') await dailyManager.handle(msg);
    },

    captureMessageDebug(msg) {
        const debug = state.config.settings?.messageDebug || {};
        if (debug.enabled !== true) return false;

        const targetId = String(debug.targetId || '').trim();
        const channelId = String(debug.channelId || '').trim();
        const guildId = String(debug.guildId || '').trim();
        if ((targetId && String(msg.author?.id || '') !== targetId) ||
            (channelId && String(msg.channel?.id || msg.channelId || '') !== channelId) ||
            (guildId && String(msg.guild?.id || msg.guildId || '') !== guildId)) {
            return false;
        }

        const hasEmbeds = Array.isArray(msg.embeds) && msg.embeds.length > 0;
        const hasComponents = Array.isArray(msg.components) && msg.components.length > 0;
        const messageType = hasComponents ? 'components' : hasEmbeds ? 'embed' : 'text';
        const entry = {
            capturedAt: new Date().toISOString(),
            messageType,
            message: {
                id: msg.id,
                content: msg.content || '',
                author: toJsonValue(msg.author),
                channelId: msg.channel?.id || msg.channelId || null,
                guildId: msg.guild?.id || msg.guildId || null,
                embeds: (msg.embeds || []).map(toJsonValue),
                components: (msg.components || []).map(toJsonValue),
                attachments: toJsonValue(msg.attachments)
            }
        };

        state.messageDebugEntries = state.messageDebugEntries || [];
        state.messageDebugEntries.unshift(entry);
        if (state.messageDebugEntries.length > MESSAGE_DEBUG_LIMIT) state.messageDebugEntries.length = MESSAGE_DEBUG_LIMIT;

        log.info(`${accountPrefix(state)}🔎 Debug pesan ditangkap: ${messageType}, message=${msg.id}, channel=${entry.message.channelId || '-'}, guild=${entry.message.guildId || '-'}`);
        return true;
    },

    async handleControlCommands(msg) {
        const text = String(msg.content || '').trim().toLowerCase();
        const isSelf = !!state.client.user && msg.author.id === state.client.user.id;

        if (text && typeof configManager.getLucyControlCommands === 'function') {
            const lucy = configManager.getLucyControlCommands();
            const isLucyController = isSelf || lucy.allowIds.includes(msg.author.id);
            if (isLucyController && (text === lucy.startCmd || text === lucy.pauseCmd)) {
                this.setLucyFeatures(text === lucy.startCmd);
                return;
            }
        }

        // --- 🔊 FITUR BARU: JOIN VC ---
        if (text.startsWith("vjoin ")) {
            const args = text.split(" ");
            const channelId = args[1];

            if (channelId && voiceManager) {
                try {
                    const result = await voiceManager.join(channelId, { persist: true, source: 'command' });

                    if (!result) {
                        msg.react("❌").catch(()=>{});
                        return;
                    }

                    msg.react("✅").catch(()=>{});

                } catch (err) {
                    log.error(`${accountPrefix(state)}Gagal join VC: ${err.message}`);
                    msg.react("⚠️").catch(()=>{});
                }
            }
            return;
        }

        // --- 🔇 FITUR BARU: LEAVE VC ---
        if (text === "vleave") {
            try {
                if (!msg.guildId || !voiceManager) return;

                if (voiceManager.leave(msg.guildId)) {
                    log.info(`${accountPrefix(state)}🔇 Keluar dari VC di server ${msg.guild?.name || msg.guildId}`);
                    msg.react("👋").catch(()=>{});
                } else {
                    msg.react("❓").catch(()=>{});
                }
            } catch (err) {
                log.error(`${accountPrefix(state)}Gagal leave VC: ${err.message}`);
            }
            return;
        }
    },

    // Lucy (Boss2, Gems, Adventure, Custom Commands Lucy, Monster Catcher) berjalan via scheduler ini.
    setLucyFeatures(enabled) {
        const settings = state.config.settings = state.config.settings || {};
        settings.boss2 = { ...(settings.boss2 || {}), enabled };
        settings.gems = { ...(settings.gems || {}), enabled };
        settings.adventure = { ...(settings.adventure || {}), enabled };
        settings.huntbot2 = { ...(settings.huntbot2 || {}), enabled };
        settings.monsterCatcher = { ...(settings.monsterCatcher || {}), enabled };
        settings.daily = { ...(settings.daily || {}), enabled };
        const otherCommands = Array.isArray(state.config.otherCommands) ? state.config.otherCommands : [];
        otherCommands.forEach(command => { if (command) command.enabled = enabled; });
        // Command tetap (lb/lh) ikut hidup/mati bersama fitur Lucy lainnya (satu unit).
        if (state.config.fixedCommands) state.config.fixedCommands.enabled = enabled;
        configManager.save();

        if (enabled) {
            // Control Lucy start: lanjutkan akun yang terjeda emergency/timeout
            // secara manual tanpa menunggu recovery linv otomatis.
            // resume() sudah memulai ulang semua slot (startAll), jadi jangan
            // memanggil startOtherCommand lagi agar command tidak terkirim ganda.
            if (typeof emergencyHandler?.resume === 'function') {
                emergencyHandler.resume();
            } else {
                loopManager?.startAll?.();
            }
            if (adventureManager) {
                adventureManager.start({ restart: true }).catch(error => log.error(`${accountPrefix(state)}❌ Auto Adventure gagal dimulai: ${error.message}`));
            }
            // Daily Lucy: jadwalkan ulang 00:00 WIB bila fitur aktif.
            try { dailyManager?.start?.(); }
            catch (error) { log.error(`${accountPrefix(state)}❌ Penjadwal Daily gagal dimulai: ${error.message}`); }
            log.success(`${accountPrefix(state)}▶️ Lucy start via Discord control.`);
            telegramService?.send?.(`▶️ <b>Lucy Started</b> via Discord command`);
        } else {
            adventureManager?.stop?.();
            otherCommands.forEach((_, index) => loopManager?.stopOtherCommand?.(index));
            loopManager?.stopOtherCommand?.(3); // unit lb+lh (satu unit)
            boss2Manager?.stop?.();
            gemsManager?.stop?.();
            huntbot2Manager?.stop?.();
            monsterCatcherManager?.stop?.();
            dailyManager?.stop?.();
            log.warn(`${accountPrefix(state)}⏸️ Lucy pause via Discord control.`);
            telegramService?.send?.(`⏸️ <b>Lucy Paused</b> via Discord command`);
        }
    },

    // ✅ FITUR BARU: Fungsi pengawas CCTV (Semua pesan dari user lain)
    async handleUserMessages(msg) {
        const myId = state.client?.user?.id;

        if (state.config.safety.cctv === false || !myId) return;

        if (msg.author.id === myId || msg.author.bot) return;

        const filter = state.config.settings?.messageFilter || {};
        const channelIds = Array.isArray(filter.channelIds) ? filter.channelIds : [];
        const guildIds = Array.isArray(filter.guildIds) ? filter.guildIds : [];
        if (channelIds.length && !channelIds.includes(msg.channel.id)) return;
        if (guildIds.length && !guildIds.includes(msg.guild?.id)) return;

        const isMentioned = msg.mentions?.users?.has(myId) || msg.content.includes(myId);
        const isReplyToMe = msg.type === 'REPLY' && msg.mentions?.repliedUser?.id === myId;

        let alertType = "PESAN BARU";
        if (isMentioned) alertType = "MENTION / TAG";
        if (isReplyToMe) alertType = "REPLY MESSAGE";

        log.warn(`${accountPrefix(state)}💬 ${alertType} terdeteksi dari ${msg.author.username}! Meneruskan ke Telegram...`);

        const senderName = msg.author.username;
        const channelName = msg.channel.name || 'DM/Unknown';
        const content = msg.content || '[Hanya Attachment / Kosong]';
        const serverId = msg.guild ? msg.guild.id : '@me';
        const messageUrl = `https://discord.com/channels/${serverId}/${msg.channel.id}/${msg.id}`;

        const tgMessage = `👀 <b>${alertType} DETECTED!</b>\n` +
                          `👤 <b>Dari:</b> ${senderName}\n` +
                          `🏠 <b>Channel:</b> #${channelName}\n` +
                          `📝 <b>Pesan:</b> <i>${content}</i>\n\n` +
                          `🔗 <a href="${messageUrl}">Klik untuk melihat pesan</a>`;

        telegramService.send(tgMessage);

        if (macrodroidService) {
            await macrodroidService.trigger("pesanbaru");
        }
    }
    });
};
