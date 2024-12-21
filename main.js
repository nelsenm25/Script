import {
    EffectTypes,
    GameMode,
    ItemComponentTypes,
    ItemStack,
    Player,
    system,
    TicksPerSecond,
    world
} from "@minecraft/server";
import { ActionFormData, MessageFormData, ModalFormData } from "@minecraft/server-ui";
import { database } from "./database/index";
import moment from "./moment/moment";
import "./utils/players.js";
import { freeCam } from "./systems/freeCam.js";

const overworld = world.getDimension("overworld");
export const delay = ticks => new Promise(res => system.runTimeout(res, ticks));

let playerJoined = false;
let worldLoaded = false;
let scoreboardsLoaded = false;

/**
 * @type Player[]
 */
let players = [];

let admins = [];
let simcount = 0;
let tntFlag = "-autnt0";
let stuckJailedPlayers = [];
let invChests = [];
let pendingMenuPlayers = [];

system.beforeEvents.watchdogTerminate.subscribe(watchdog => { watchdog.cancel = true });

system.runInterval(async () => {
    players = [...world.getPlayers()];

    try { admins = [...world.scoreboard.getObjective('-au').getParticipants().map(admin => admin.displayName)] } catch (e) { }

    if (scoreboardsLoaded === false) {
        try { world.scoreboard.addObjective('-au', '-au') } catch (e) { }
        try { world.scoreboard.addObjective('-auOwner', '-auOwner') } catch (e) { }
        try { world.scoreboard.addObjective('-auBan', '-auBan') } catch (e) { }
        try { world.scoreboard.addObjective('-auProj', '-auProj') } catch (e) { }
        try { world.scoreboard.addObjective('-auFrozen', '-auFrozen') } catch (e) { }
        try { world.scoreboard.addObjective('-auJailed', '-auJailed') } catch (e) { }
        try { world.scoreboard.addObjective('-auTempUnjailed', '-auTempUnjailed') } catch (e) { }
        try { world.scoreboard.addObjective('-auJailLoc', '-auJailLoc') } catch (e) { }
        try { world.scoreboard.addObjective('-auJailExitLoc', '-auJailExitLoc') } catch (e) { }
        try { world.scoreboard.addObjective('-auVanished', '-auVanished') } catch (e) { }
        try { world.scoreboard.addObjective('-auInvSees', '-auInvSees') } catch (e) { }
        try { world.scoreboard.addObjective('-auTempKilled', '-auTempKilled') } catch (e) { }
        scoreboardsLoaded = true;
        asyncText();
        async function asyncText() {
            while (world.getAllPlayers().length === 0) {
                await delay(10);
            }
            playerJoined = true;
            await delay(6 * TicksPerSecond);
            world.sendMessage("§l§4§kqww§r§l§bThanks for using Admin Utils! §aMade by §6MisledPaul58§4§kqww");
            worldLoaded = true;
        }
    }

    if (worldLoaded === true) {
        if (getInvSees()) {
            for (const invChest of getInvSees()) {
                if (!invChests.includes(invChest.scoreboard)) {
                    invChests.push(invChest.scoreboard);
                    chestTick();
                    async function chestTick() {
                        const dimension = world.getDimension(invChest.dimension);
                        const run = system.runInterval(() => { //Controls if any block is broken
                            const chest1 = dimension.getBlock({ x: invChest.pos1[0], y: invChest.pos1[1], z: invChest.pos1[2] });
                            const chest2 = dimension.getBlock({ x: invChest.pos2[0], y: invChest.pos2[1], z: invChest.pos2[2] });
                            const sign = dimension.getBlock({ x: invChest.signPos[0], y: invChest.signPos[1], z: invChest.signPos[2] });
                            if (chest1?.isValid() && chest2?.isValid() && sign?.isValid()) {
                                if (chest1.type.id !== "minecraft:chest" || chest2.type.id !== "minecraft:chest" || chest1.permutation !== chest2.permutation || sign.getComponent("minecraft:sign")?.getText() !== `§b${invChest.target}'s §qinventory`) {
                                    chest1.setType("minecraft:air");
                                    chest2.setType("minecraft:air");
                                    sign.setType("minecraft:air");
                                    dimension.runCommand(`kill @e[type=item, x=${chest1.x}, y=${chest1.y}, z=${chest1.z}, r=1.7]`);
                                    dimension.runCommand(`kill @e[type=item, x=${chest2.x}, y=${chest2.y}, z=${chest2.z}, r=1.7]`);
                                    world.scoreboard.getObjective('-auInvSees').removeParticipant(invChest.scoreboard);
                                    invChests.splice(invChests.indexOf(invChest.scoreboard), 1);
                                    system.clearRun(run);
                                }
                            }
                        }, 1);

                        let initChest = true;
                        let replaceInvWhenJoin = false;
                        let replaceChestWhenLoad = false;
                        let lastTargetData = [
                            {
                                invItems: [],
                                equipments: []
                            },
                            {
                                invItems: [],
                                equipments: []
                            }
                        ];
                        let lastChestData = [
                            {
                                invItems: [],
                                equipments: []
                            },
                            {
                                invItems: [],
                                equipments: []
                            }
                        ];
                        let recentlyChangedSlots = {
                            inv: [],
                            equip: []
                        };
                        while (world.scoreboard.getObjective('-auInvSees').hasParticipant(invChest.scoreboard)) {
                            const chest1 = dimension.getBlock({ x: invChest.pos1[0], y: invChest.pos1[1], z: invChest.pos1[2] });
                            const chest2 = dimension.getBlock({ x: invChest.pos2[0], y: invChest.pos2[1], z: invChest.pos2[2] });
                            const sign = dimension.getBlock({ x: invChest.signPos[0], y: invChest.signPos[1], z: invChest.signPos[2] });
                            if (chest1?.isValid() && chest2?.isValid() && sign?.isValid()) {
                                if (initChest === true) await delay(20);
                                const chestContainer = chest1.getComponent("minecraft:inventory").container;
                                if (!world.getPlayers({ name: invChest.target })[0]) { //Waits until the player joins
                                    replaceInvWhenJoin = true;
                                    await delay(3);

                                } else if (initChest === true) {
                                    //Initialize the chest
                                    const rawTarget = world.getPlayers({ name: invChest.target })[0];
                                    if (rawTarget) { //Double check
                                        const targetInventory = rawTarget.getComponent("minecraft:inventory").container;
                                        const targetEquipments = rawTarget.getComponent("minecraft:equippable");
                                        for (let slot = 9; slot < 36; slot++) {
                                            chestContainer.setItem(slot + 9, targetInventory.getItem(slot));
                                        }
                                        for (let slot = 0; slot < 9; slot++) {
                                            chestContainer.setItem(slot + 45, targetInventory.getItem(slot));
                                        }
                                        const chestEquipSlots = [0, 1, 2, 3, 8];
                                        const targetEquipSlots = ["Head", "Chest", "Legs", "Feet", "Offhand"];
                                        for (const slot in chestEquipSlots) {
                                            chestContainer.setItem(chestEquipSlots[slot], targetEquipments.getEquipment(targetEquipSlots[slot]));
                                        }
                                        initChest = false;
                                        replaceInvWhenJoin = false;
                                        await delay(1);
                                    }
                                } else if (replaceInvWhenJoin === true) {
                                    const rawTarget = world.getPlayers({ name: invChest.target })[0];
                                    if (rawTarget) {
                                        await handleInventories(invChest, lastTargetData, lastChestData, recentlyChangedSlots, "inv");
                                        replaceInvWhenJoin = false;
                                    }
                                } else if (replaceChestWhenLoad === true) {
                                    const rawTarget = world.getPlayers({ name: invChest.target })[0];
                                    if (rawTarget) {
                                        await handleInventories(invChest, lastTargetData, lastChestData, recentlyChangedSlots, "chest");
                                        replaceChestWhenLoad = false;
                                    }
                                } else {
                                    const rawTarget = world.getPlayers({ name: invChest.target })[0];
                                    if (rawTarget) {
                                        await handleInventories(invChest, lastTargetData, lastChestData, recentlyChangedSlots);
                                    }
                                }
                            } else if (world.getPlayers({ name: invChest.target })[0]) {
                                replaceChestWhenLoad = true;
                                await delay(3);
                            }
                        }
                    }
                }
            }
        }
    }

    for (const player of players) {
        if (player.hasTag("owner")) {
            if (world.scoreboard.getObjective('-auOwner').getParticipants()[0]) {
                player.removeTag("owner");
                world.sendMessage(`§cError, §4${world.scoreboard.getObjective('-auOwner').getParticipants()[0].displayName.match(/(?<=^-au)[^]+(?=-au$)/)[0]}§c is already the owner.`);

            } else if (!world.scoreboard.getObjective('-auOwner').getParticipants()[0]) {
                player.removeTag("owner");
                try {
                    world.scoreboard.getObjective('-auOwner').setScore(`-au${player.name}-au`, 0);
                    world.sendMessage(`§aThe player §b${player.name}§a has been set successfully as the owner.`);
                } catch (e) {
                    world.sendMessage(`§Error, couldn't set §4${player.name}§c as the owner.`);
                }
            }

        }

        if (player.hasTag("-auadmin")) {
            player.removeTag("-auadmin");
            try {
                await runCmd(overworld, `scoreboard players set "-au${player.name}-au" -au 0`);
                await runCmd(overworld, `execute @a ~~~ tellraw @s {"rawtext": [{ "text": "§aThe player §b${player.name}§a has been added successfully as an admin." }]}`);
            } catch (e) {
                await runCmd(overworld, `execute @a ~~~ tellraw @s {"rawtext": [{ "text": "§cError, couldn't add ${player.name} as an admin, probably they already are." }]}`);
            }
        }

        const tags = player.getTags();
        if (tags.some(tag => /-aukill(?:creative|spectator)/.test(tag))) {
            const gamemode = tags.find(tag => /(?<=^-aukill)\w+/.test(tag)).match(/(?<=^-aukill)\w+/)[0];
            player.runCommand(`gamemode ${gamemode}`);

            player.removeTag(tags.find(tag => /^-aukill\w+/.test(tag)));
        }

        if (isFrozen(player.name)) {
            try {
                const positions = world.scoreboard.getObjective('-auFrozen').getParticipants().filter(participant => participant.displayName.match(/-auname([^]*) -au-?[0-9]+[^]* -au-?[0-9]+[^]* -au-?[0-9]+[^]*/)[1] === player.name)[0].displayName.match(/-au(-?[0-9]+[^]*) -au(-?[0-9]+[^]*) -au(-?[0-9]+[^]*)/).slice(1).map(pos => pos * 1); //Gets the positions where the player was frozen and converts it to integer or float
                try { player.teleport({ x: positions[0], y: positions[1], z: positions[2] }, { dimension: player.dimension }) } catch (e) { }
            } catch (e) {
                const scoreboard = world.scoreboard.getObjective('-auFrozen').getParticipants().filter(participant => participant.displayName.match(/-auname([^]*) -au-?(?:[0-9]+[^]*|\+) -au-?(?:[0-9]+[^]*|\+) -au-?(?:[0-9]+[^]*|\+)/)[1] === player.name)[0].displayName;
                await runCmd(player.dimension, `scoreboard players reset "${scoreboard}" -auFrozen`);
                await runCmd(player.dimension, `scoreboard players set "-auname${player.name} -au${player.location.x} -au${player.location.y} -au${player.location.z}" -auFrozen 0`);
            }
        }

        if (isVanished(player.name)) {
            player.addEffect(EffectTypes.get('invisibility'), 1 * TicksPerSecond, { amplifier: 1, showParticles: false });
            player.playAnimation('animation.player.vanish', { blendOutTime: 1 });
        }

        if(player.getComponent("minecraft:inventory").container.getItem(player.selectedSlotIndex)?.typeId === "au:wand") {
            player.runCommand("enchant @s unbreaking 3");
        }
    }

    for (const bannedPlayer of getBannedPlayers().filter(player => !isPermaBanned(player))) {
        if (isBanTimeOver(bannedPlayer)) {
            const reason = getBanReason(bannedPlayer);
            const bannedBy = getBannedBy(bannedPlayer);
            const banISO = getUnBanISO(bannedPlayer);
            overworld.runCommand(`scoreboard players reset "${bannedPlayer}-aureason${reason}-auban${bannedBy}-autime${banISO}" -auBan`);
        }
    }

    for (const jailedPlayer of getJailedPlayers()) {
        const reason = getJailReason(jailedPlayer);
        const jailedBy = getJailedBy(jailedPlayer);
        const jailedPlayerRaw = world.getPlayers({ name: jailedPlayer })[0];

        if (isJailTimeOver(jailedPlayer)) {
            if (!jailedPlayerRaw) {
                const releaseISO = getReleaseISO(jailedPlayer);
                if (world.scoreboard.getObjective('-auTempUnjailed').hasParticipant('/' + jailedPlayer)) {
                    world.scoreboard.getObjective('-auJailed').removeParticipant(`${jailedPlayer}-aureason${reason}-aujailedby${jailedBy}-autime${releaseISO}-auhasjoined${hasJailedPlJoined(jailedPlayer)}`);
                } else {
                    world.scoreboard.getObjective('-auJailed').removeParticipant(`${jailedPlayer}-aureason${reason}-aujailedby${jailedBy}-autime${releaseISO}-auhasjoined${hasJailedPlJoined(jailedPlayer)}`);
                    world.scoreboard.getObjective('-auTempUnjailed').setScore('/' + jailedPlayer, 0);
                }
            } else {
                if (!isJailExitLocSet()) {
                    if (!world.getPlayers({ name: jailedPlayer, gameMode: GameMode.adventure })[0]) {
                        jailedPlayerRaw.runCommand('gamemode adventure');
                    }
                    jailedPlayerRaw.addEffect(EffectTypes.get('resistance'), 2 * TicksPerSecond, { amplifier: 255, showParticles: false });
                    jailedPlayerRaw.addEffect(EffectTypes.get('weakness'), 2 * TicksPerSecond, { amplifier: 255, showParticles: false });
                    jailedPlayerRaw.addEffect(EffectTypes.get('saturation'), 2 * TicksPerSecond, { amplifier: 255, showParticles: false });

                    jailedPlayerRaw.onScreenDisplay.setActionBar(`§l§o§m* §4Remaining time: §cthe jail exit location has been removed, please wait until a new location is set.\n§m* §4Reason: §c${reason}\n§m* §4Jailed by: §c${jailedBy}`);
                } else {
                    const releaseISO = getReleaseISO(jailedPlayer);
                    world.scoreboard.getObjective('-auJailed').removeParticipant(`${jailedPlayer}-aureason${reason}-aujailedby${jailedBy}-autime${releaseISO}-auhasjoined${hasJailedPlJoined(jailedPlayer)}`);
                    try {
                        jailedPlayerRaw.runCommand("camera @s fade time 3 1 1 color 0 0 0");
                        await delay(60);
                        jailedPlayerRaw.teleport(getJailExitLoc()[0], getJailExitLoc()[1]);
                        jailedPlayerRaw.runCommand('gamemode survival')
                        await delay(20);
                        jailedPlayerRaw.onScreenDisplay.setTitle('§l§bYou have been released', { fadeInDuration: 2 * TicksPerSecond, stayDuration: 1.5 * TicksPerSecond, fadeOutDuration: 2 * TicksPerSecond });
                        await runCmd(jailedPlayerRaw, "playsound beacon.activate @s ~ ~ ~ 100");
                    } catch (e) {
                        //If the player leaves while they're being released
                        if (!world.scoreboard.getObjective('-auTempUnjailed').hasParticipant('/' + jailedPlayer)) {
                            world.scoreboard.getObjective('-auTempUnjailed').setScore('/' + jailedPlayer, 0);
                        }
                    }
                }
            }
        } else if (jailedPlayerRaw) {
            if (!world.getPlayers({ name: jailedPlayer, gameMode: GameMode.adventure })[0]) {
                jailedPlayerRaw.runCommand('gamemode adventure');
            }
            jailedPlayerRaw.addEffect(EffectTypes.get('resistance'), 2 * TicksPerSecond, { amplifier: 255, showParticles: false });
            jailedPlayerRaw.addEffect(EffectTypes.get('weakness'), 2 * TicksPerSecond, { amplifier: 255, showParticles: false });
            jailedPlayerRaw.addEffect(EffectTypes.get('saturation'), 2 * TicksPerSecond, { amplifier: 255, showParticles: false });

            if (isPermaJailed(jailedPlayer)) {
                if (!hasJailedPlJoined(jailedPlayer) && !isJailLocSet()) {
                    jailedPlayerRaw.onScreenDisplay.setActionBar(`§l§o§cError, the jail location has been removed, you will be teleported once a new location is set.\n§m* §4Remaining time: §cPermanent\n§m* §4Reason: §c${reason}\n§m* §4Jailed by: §c${jailedBy}`);
                } else {
                    jailedPlayerRaw.onScreenDisplay.setActionBar(`§l§o§m* §4Remaining time: §cPermanent\n§m* §4Reason: §c${reason}\n§m* §4Jailed by: §c${jailedBy}`);
                }
            } else {
                const releaseDate = moment(getReleaseISO(jailedPlayer), moment.ISO_8601);
                const currentDate = moment();
                moment.duration()
                const remainingTime = moment.duration(releaseDate.diff(currentDate));

                const remainingYears = remainingTime.years();
                const remainingMonths = remainingTime.months();
                const remainingWeeks = remainingTime.weeks();
                remainingTime.subtract(remainingWeeks * 7, 'days');
                const remainingDays = remainingTime.days();
                const remainingHours = remainingTime.hours();
                const remainingMinutes = remainingTime.minutes();
                const remainingSeconds = remainingTime.seconds();

                const years = remainingYears === 0 ? "" : remainingYears === 1 ? `${remainingYears} year ` : `${remainingYears} years `;
                const months = remainingMonths === 0 ? "" : remainingMonths === 1 ? `${remainingMonths} month ` : `${remainingMonths} months `;
                const weeks = remainingWeeks === 0 ? "" : remainingWeeks === 1 ? `${remainingWeeks} week ` : `${remainingWeeks} weeks `;
                const days = remainingDays === 0 ? "" : remainingDays === 1 ? `${remainingDays} day ` : `${remainingDays} days `;
                const hours = remainingHours === 0 ? "" : remainingHours === 1 ? `${remainingHours} hour ` : `${remainingHours} hours `;
                const minutes = remainingMinutes === 0 ? "" : remainingMinutes === 1 ? `${remainingMinutes} minute ` : `${remainingMinutes} minutes `;
                const seconds = remainingSeconds === 0 ? "" : remainingSeconds === 1 ? `${remainingSeconds} second` : `${remainingSeconds} seconds`;

                if (!hasJailedPlJoined(jailedPlayer) && !isJailLocSet()) {
                    jailedPlayerRaw.onScreenDisplay.setActionBar(`§l§o§cError, the jail location has been removed, you will be teleported once a new location is set.\n§m* §4Remaining time: §c${years}${months}${weeks}${days}${hours}${minutes}${seconds}\n§m* §4Reason: §c${reason}\n§m* §4Jailed by: §c${jailedBy}`);
                } else {
                    jailedPlayerRaw.onScreenDisplay.setActionBar(`§l§o§m* §4Remaining time: §c${years}${months}${weeks}${days}${hours}${minutes}${seconds}\n§m* §4Reason: §c${reason}\n§m* §4Jailed by: §c${jailedBy}`);
                }
            }
        }
    }
}, 1);

world.beforeEvents.chatSend.subscribe(event => {
    if (isAdmin(event.sender.name) && event.message.toLowerCase() === "-au") {
        event.cancel = true;
        const { sender } = event;

        system.run(async () => {
            sender.playSound("au.menuOpen", { location: { x: sender.location.x, y: sender.location.y + 1, z: sender.location.z } });
            const form = new ActionFormData()
                .title("§l§4§kkdk§r§l§cAdmin§aUtils §bGUI§4§kkdk")
                .body("Select an option")
                .button("Admin settings\n" +
                    "§8[ §b§oClick to open§r §8]§r", "textures/icons/settings1.png")
                .button("Admin utils\n" +
                    "§8[ §b§oClick to open§r §8]§r", "textures/icons/adminUtils.png");

            if (!pendingMenuPlayers.includes(sender.name)) waitForUser();

            async function waitForUser() {
                pendingMenuPlayers.push(sender.name);

                while (pendingMenuPlayers.includes(sender.name)) {
                    const response = await form.show(sender);

                    if (response?.cancelationReason !== "UserBusy") {
                        pendingMenuPlayers.splice(pendingMenuPlayers.indexOf(sender.name), 1);

                        switch (response.selection) {
                            case 0: {
                                adminSettings(sender);
                                break;
                            }
                            case 1: {
                                adminUtils(sender);
                                break;
                            }
                        }
                    } else {
                        await delay(4);
                    }
                }
            }
        });
    }
});

world.afterEvents.playerJoin.subscribe(async event => {
    const { playerName } = event;
    if (isBanned(playerName)) {
        const reason = getBanReason(playerName);
        const bannedBy = getBannedBy(playerName);
        if (isPermaBanned(playerName)) {
            waitForTestFor();
            async function waitForTestFor() {
                while (function () { //Waits until the banned player actually joins
                    const { successCount } = overworld.runCommand(`testfor "${playerName}"`);
                    if (successCount === 1) return false
                    else return true;
                }()) {
                    await delay(1);
                }

                overworld.runCommand(`kick "${playerName}" "\n§l§6----------------------------\n§l§4§k|||||§r§l§cYou were permanently banned by §4${bannedBy}§4§k|||||§r\n§l§o§4Reason: §c${reason}\n§r§l§6----------------------------§r"`);
            }
        } else {
            const unBanDate = moment(getUnBanISO(playerName), moment.ISO_8601);
            const currentDate = moment();
            const remainingTime = moment.duration(unBanDate.diff(currentDate));

            const remainingYears = remainingTime.years();
            const remainingMonths = remainingTime.months();
            const remainingWeeks = remainingTime.weeks();
            remainingTime.subtract(remainingWeeks * 7, 'days');
            const remainingDays = remainingTime.days();
            const remainingHours = remainingTime.hours();
            const remainingMinutes = remainingTime.minutes();
            const remainingSeconds = remainingTime.seconds();

            waitForTestFor();
            async function waitForTestFor() {
                while (function () { //Waits until the banned player actually joins
                    const { successCount } = overworld.runCommand(`testfor "${playerName}"`);
                    if (successCount === 1) return false
                    else return true;
                }()) {
                    await delay(10);
                }

                await delay(4);
                const years = remainingYears === 0 ? "" : remainingYears === 1 ? `${remainingYears} year ` : `${remainingYears} years `;
                const months = remainingMonths === 0 ? "" : remainingMonths === 1 ? `${remainingMonths} month ` : `${remainingMonths} months `;
                const weeks = remainingWeeks === 0 ? "" : remainingWeeks === 1 ? `${remainingWeeks} week ` : `${remainingWeeks} weeks `;
                const days = remainingDays === 0 ? "" : remainingDays === 1 ? `${remainingDays} day ` : `${remainingDays} days `;
                const hours = remainingHours === 0 ? "" : remainingHours === 1 ? `${remainingHours} hour ` : `${remainingHours} hours `;
                const minutes = remainingMinutes === 0 ? "" : remainingMinutes === 1 ? `${remainingMinutes} minute ` : `${remainingMinutes} minutes `;
                const seconds = remainingSeconds === 0 ? "" : remainingSeconds === 1 ? `${remainingSeconds} second` : `${remainingSeconds} seconds`;

                overworld.runCommand(`kick "${playerName}" "\n§l§6----------------------------\n§l§4§k|||||§r§l§cYou were temporarily banned by §4${bannedBy}§4§k|||||§r\n§l§o§4Reason: §c${reason}\n§4Remaining time: §c${years}${months}${weeks}${days}${hours}${minutes}${seconds}\n§r§l§6----------------------------§r"`);
            }
        }
    } else if (world.scoreboard.getObjective('-auTempUnjailed').hasParticipant('/' + playerName)) {
        waitForTestFor();
        async function waitForTestFor() {
            while (function () {
                const { successCount } = overworld.runCommand(`testfor "${playerName}"`);
                if (successCount === 1) return false
                else return true;
            }()) {
                await delay(10);
            }

            await delay(20);
            const playerRaw = world.getPlayers({ name: playerName })[0];
            const reason = getJailReason(playerName);
            const jailedBy = getJailedBy(playerName);

            while (!isJailExitLocSet()) {
                if (!world.getPlayers({ name: playerName, gameMode: GameMode.adventure })[0]) {
                    await runCmd(playerRaw, 'gamemode adventure');
                }
                playerRaw.addEffect(EffectTypes.get('resistance'), 2 * TicksPerSecond, { amplifier: 255, showParticles: false });
                playerRaw.addEffect(EffectTypes.get('weakness'), 2 * TicksPerSecond, { amplifier: 255, showParticles: false });
                playerRaw.addEffect(EffectTypes.get('saturation'), 2 * TicksPerSecond, { amplifier: 255, showParticles: false });

                playerRaw.onScreenDisplay.setActionBar(`§l§o§m* §4Remaining time: §cthe jail exit location has been removed, please wait until a new location is set.\n§m* §4Reason: §c${reason}\n§m* §4Jailed by: §c${jailedBy}`);
                await delay(10);
            }

            playerRaw.runCommand("camera @s fade time 3 1 1 color 0 0 0");
            await delay(60);
            playerRaw.teleport(getJailExitLoc()[0], getJailExitLoc()[1]);
            world.scoreboard.getObjective('-auTempUnjailed').removeParticipant('/' + playerName);
            playerRaw.runCommand('gamemode survival');
            await delay(20);
            playerRaw.onScreenDisplay.setTitle('§l§bYou have been released', { fadeInDuration: 2 * TicksPerSecond, stayDuration: 1.5 * TicksPerSecond, fadeOutDuration: 2 * TicksPerSecond });
            runCmd(playerRaw, "playsound beacon.activate @s ~ ~ ~ 100");
        }
    } else if (isJailed(playerName)) {
        testfor();
        async function testfor() {
            while (function () {
                const { successCount } = overworld.runCommand(`testfor "${playerName}"`);
                if (successCount === 1) return false
                else return true;
            }()) {
                await delay(10);
            }
            await delay(20);

            const playerRaw = world.getPlayers({ name: playerName })[0];
            try {
                if (!hasJailedPlJoined(playerName)) { //If the jailed player hasn't been teleported to the jail location yet (also usually implies it hasn't joined the world until now)
                    const reason = getJailReason(playerName);
                    const jailedBy = getJailedBy(playerName);
                    const releaseISO = getReleaseISO(playerName);

                    if (!isJailLocSet()) { //If the jail location isn't set
                        if (!stuckJailedPlayers.includes(playerName)) {
                            stuckJailedPlayers.push(playerName);
                            waitForJailLoc();
                            async function waitForJailLoc() {
                                while (!isJailLocSet()) {
                                    if (!playerRaw) {
                                        stuckJailedPlayers.splice(stuckJailedPlayers.indexOf(playerName), 1);
                                        return;
                                    }
                                    await delay(10);
                                }
                                if (!playerRaw) {
                                    stuckJailedPlayers.splice(stuckJailedPlayers.indexOf(playerName), 1);
                                    return;
                                } else if (isJailed(playerName)) {
                                    if (getReleaseMillisecondsLeft(playerName) > 6100 || isPermaJailed(playerName)) { //If there is enough time to show the teleport animation or if the player is permanently jailed
                                        playerRaw.runCommand("camera @s set au:tpanimation ease 5 in_sine pos ~ ~100 ~ rot 90 0");
                                        await delay(40);
                                        playerRaw.runCommand("camera @s fade time 3 1 1 color 0 0 0");
                                        await delay(60);
                                        playerRaw.teleport(getJailLoc()[0], getJailLoc()[1]);
                                        playerRaw.runCommand("camera @s clear");
                                        await delay(20);
                                        playerRaw.onScreenDisplay.setTitle('§l§cYou have been jailed', { fadeInDuration: 2 * TicksPerSecond, stayDuration: 1.5 * TicksPerSecond, fadeOutDuration: 2 * TicksPerSecond });
                                        runCmd(playerRaw, 'playsound random.anvil_land @s ~ ~ ~ 100 0.5');

                                        overworld.runCommand(`scoreboard players set "${playerName}-aureason${reason}-aujailedby${jailedBy}-autime${releaseISO}-auhasjoinedtrue" -auJailed 0`);
                                        world.scoreboard.getObjective('-auJailed').removeParticipant(`${playerName}-aureason${reason}-aujailedby${jailedBy}-autime${releaseISO}-auhasjoinedfalse`);
                                        stuckJailedPlayers.splice(stuckJailedPlayers.indexOf(playerName), 1); //Removes the player from the array

                                    } else if (getReleaseMillisecondsLeft(playerName > 1000)) { //If there isn't enough time to show the animation but he can be teleported
                                        playerRaw.teleport(getJailLoc()[0], getJailLoc()[1]);
                                        playerRaw.onScreenDisplay.setTitle('§l§cYou have been jailed', { fadeInDuration: 2 * TicksPerSecond, stayDuration: 1.5 * TicksPerSecond, fadeOutDuration: 2 * TicksPerSecond });
                                        runCmd(playerRaw, 'playsound random.anvil_land @s ~ ~ ~ 100 0.5');

                                        overworld.runCommand(`scoreboard players set "${playerName}-aureason${reason}-aujailedby${jailedBy}-autime${releaseISO}-auhasjoinedtrue" -auJailed 0`);
                                        world.scoreboard.getObjective('-auJailed').removeParticipant(`${playerName}-aureason${reason}-aujailedby${jailedBy}-autime${releaseISO}-auhasjoinedfalse`);
                                        stuckJailedPlayers.splice(stuckJailedPlayers.indexOf(playerName), 1);

                                    } else { //If there isn't even enough time to teleport the player
                                        playerRaw.onScreenDisplay.setTitle('§l§cYou have been jailed', { fadeInDuration: 2 * TicksPerSecond, stayDuration: 1.5 * TicksPerSecond, fadeOutDuration: 2 * TicksPerSecond });
                                        stuckJailedPlayers.splice(stuckJailedPlayers.indexOf(playerName), 1);
                                    }
                                } else {
                                    stuckJailedPlayers.splice(stuckJailedPlayers.indexOf(playerName), 1);
                                }
                            }
                        }
                    } else { //If the jail location IS set
                        if (getReleaseMillisecondsLeft(playerName) > 6100 || isPermaJailed(playerName)) {
                            playerRaw.runCommand("camera @s set au:tpanimation ease 5 in_sine pos ~ ~100 ~ rot 90 0");
                            await delay(40);
                            playerRaw.runCommand("camera @s fade time 3 1 1 color 0 0 0");
                            await delay(60);
                            playerRaw.teleport(getJailLoc()[0], getJailLoc()[1]);
                            playerRaw.runCommand("camera @s clear");
                            await delay(20);
                            playerRaw.onScreenDisplay.setTitle('§l§cYou have been jailed', { fadeInDuration: 2 * TicksPerSecond, stayDuration: 1.5 * TicksPerSecond, fadeOutDuration: 2 * TicksPerSecond });
                            runCmd(playerRaw, 'playsound random.anvil_land @s ~ ~ ~ 100 0.5');

                            overworld.runCommand(`scoreboard players set "${playerName}-aureason${reason}-aujailedby${jailedBy}-autime${releaseISO}-auhasjoinedtrue" -auJailed 0`);
                            world.scoreboard.getObjective('-auJailed').removeParticipant(`${playerName}-aureason${reason}-aujailedby${jailedBy}-autime${releaseISO}-auhasjoinedfalse`);

                        } else if (getReleaseMillisecondsLeft(playerName) > 1000) {
                            playerRaw.teleport(getJailLoc()[0], getJailLoc()[1]);
                            playerRaw.onScreenDisplay.setTitle('§l§cYou have been jailed', { fadeInDuration: 2 * TicksPerSecond, stayDuration: 1.5 * TicksPerSecond, fadeOutDuration: 2 * TicksPerSecond });
                            runCmd(playerRaw, 'playsound random.anvil_land @s ~ ~ ~ 100 0.5');

                            overworld.runCommand(`scoreboard players set "${playerName}-aureason${reason}-aujailedby${jailedBy}-autime${releaseISO}-auhasjoinedtrue" -auJailed 0`);
                            world.scoreboard.getObjective('-auJailed').removeParticipant(`${playerName}-aureason${reason}-aujailedby${jailedBy}-autime${releaseISO}-auhasjoinedfalse`);

                        } else {
                            playerRaw.onScreenDisplay.setTitle('§l§cYou have been jailed', { fadeInDuration: 2 * TicksPerSecond, stayDuration: 1.5 * TicksPerSecond, fadeOutDuration: 2 * TicksPerSecond });
                        }
                    }
                } else { //If the player has already been teleported to the jail at some point
                    if (isJailLocSet()) {
                        playerRaw.teleport(getJailLoc()[0], getJailLoc()[1]);
                    }
                }
            } catch (e) { }
        }
    }
});

world.beforeEvents.itemUse.subscribe(data => {
    const player = data.source;

    if (isJailed(player.name)) {
        data.cancel = true;
    } else if (data.itemStack.typeId === "au:wand" && isAdmin(player.name)) {
        system.run(async () => {
            adminUtilsGui(player);
            player.playSound("au.menuOpen", { location: { x: player.location.x, y: player.location.y + 1, z: player.location.z } });
        });
    }
});

world.afterEvents.projectileHitEntity.subscribe(event => {
    try {
        const { source } = event;
        const hitEntity = event.getEntityHit().entity;
        const proj = event.projectile.typeId.replace(/minecraft:/, '');

        if (source instanceof Player && hitEntity.typeId !== "minecraft:tnt") {
            if (isPowerEnabled(source.name, proj, "bolt")) {
                hitEntity.runCommand('summon lightning_bolt');
            }
            if (isPowerEnabled(source.name, proj, "freeze")) {
                const entityLoc = hitEntity.location;
                hitEntity.runCommand(`tp ${Math.floor(entityLoc.x)} ${Math.floor(entityLoc.y)} ${Math.floor(entityLoc.z)}`);
                hitEntity.dimension.runCommand(`fill ${entityLoc.x - 1} ${entityLoc.y - 1} ${entityLoc.z - 1} ${entityLoc.x + 1} ${entityLoc.y + 2} ${entityLoc.z + 1} ice [] replace air`);
                hitEntity.dimension.runCommand(`playsound random.glass @a ${entityLoc.x} ${entityLoc.y} ${entityLoc.z} 100`);
            }
            if (isPowerEnabled(source.name, proj, "tnt")) {
                try {
                    hitEntity.runCommand('summon tnt')
                    const query = {
                        closest: 1,
                        type: "tnt",
                        excludeTags: ["-autnt"],
                        location: hitEntity.location
                    };
                    const tnt = [...hitEntity.dimension.getEntities(query)][0];
                    const _tntFlag = tntFlag;
                    tnt.addTag(_tntFlag);
                    tnt.addTag("-autnt");
                    tntFlag = `-autnt${tntFlag.match(/[0-9]+/)[0] * 1 + 1}`; //Adds 1 each time
                    asyncTntTp();
                    async function asyncTntTp() {
                        try {
                            while (function () {
                                const { successCount } = tnt.dimension.runCommand(`testfor @e[type=tnt, tag=${_tntFlag}]`);
                                if (successCount === 0) return false
                                else return true;
                            }()) {
                                await runCmd(hitEntity, `tp @e[type=tnt, tag="${_tntFlag}"] @s`);
                            }
                        } catch (e) { }
                    }
                } catch (e) { }
            }
        }
    } catch (e) {
        console.warn(e);
    }
});

function adminUtilsGui(p) {
    const form = new ActionFormData()
        .title("§l§4§kkdk§r§l§cAdmin§aUtils §bGUI§4§kkdk")
        .body("Select an option")
        .button("Admin settings\n" +
            "§8[ §b§oClick to open§r §8]§r", "textures/icons/settings1.png")
        .button("Admin utils\n" +
            "§8[ §b§oClick to open§r §8]§r", "textures/icons/adminUtils.png");
    form.show(p).then((response) => {
        switch (response.selection) {
            case 0: {
                adminSettings(p);
                break;
            }
            case 1: {
                adminUtils(p);
                break;
            }
        }
    });
}

function adminSettings(p) {
    const form = new ActionFormData()
        .title("§l§b§kkdk§r§l§cAdmin §asettings§b§kkdk")
        .body("Select an option")
        .button("§l<-- Back", "textures/icons/back.png")
        .button("Set an admin", "textures/icons/tick.png")
        .button("Add an admin", "textures/icons/add.png")
        .button("Remove an admin", "textures/icons/delete.png")
        .button("Show admins", "textures/icons/users.png");
    form.show(p).then((response) => {
        switch (response.selection) {
            case 0: { //Back
                adminUtilsGui(p);
            } break;
            case 1: { //Set an admin
                setAnAdmin();
                function setAnAdmin() {
                    const nonAdmins = players.filter(player => !isAdmin(player.name)).map(player => player.name);
                    const form = new ActionFormData()
                        .title("Admin settings: set an admin")
                        .body("Select an online player to set as an admin (all other admins will be deleted)")
                        .button("§l<-- Back", "textures/icons/back.png")
                        .button("Type an offline/online player instead", "textures/icons/pencil.png");
                    for (const player of nonAdmins) {
                        form.button(player, "textures/icons/steve_icon.png");
                    }
                    form.show(p).then((response) => {
                        if (response.canceled === true) return;
                        const { selection } = response;
                        if (selection === 0) {
                            adminSettings(p);

                        } else if (selection === 1) {
                            const form = new ModalFormData()
                                .title("Admin settings: set an admin")
                                .textField("Type below the player you would like to set as an admin (all other admins will be deleted).", "Player's name");
                            form.show(p).then(async result => {
                                if (result.canceled === true) return;
                                const player = result.formValues[0];

                                if (player === "" || !player) {
                                    p.sendMessage("§cError, please specify the name of the player you would like to set as an admin.");
                                    p.playSound("au.error");

                                } else if (!isValidUsername(player)) {
                                    p.sendMessage("§cError, the username you entered is invalid.");
                                    p.playSound("au.error");

                                } else if (isAdmin(player)) {
                                    p.sendMessage("§cError, the specified player is already an admin.");
                                    p.playSound("au.error");

                                } else {
                                    try {
                                        for (const admin of admins) {
                                            if (isOwner(p.name) || !isOwner(admin)) {
                                                world.scoreboard.getObjective('-au').removeParticipant(admin);
                                            }
                                        }
                                        world.scoreboard.getObjective('-au').setScore(`-au${player}-au`, 0);
                                        p.sendMessage(`§aAll the previous admins have been deleted, the current admin is: §b${player}§a.`);
                                    } catch (e) {
                                        p.sendMessage(`§cError, couldn't set §4${player}§c as an admin.`);
                                        p.playSound("au.error");
                                    }
                                }
                            });

                        } else if (selection >= 2) {
                            const selectedPlayer = nonAdmins[selection - 2];
                            if (isAdmin(selectedPlayer)) {
                                p.sendMessage("§cError, the selected player has recently been added as an admin by another user.");
                                p.playSound("au.error");

                            } else {
                                new MessageFormData()
                                    .title("Admin settings: set an admin")
                                    .body(`Are you sure you want to set §b${selectedPlayer}§r as an admin?\n§cAll other admins will be deleted.`)
                                    .button1("No")
                                    .button2("Yes")
                                    .show(p).then(result => {
                                        if (result.selection === 0) {
                                            setAnAdmin();
                                        } else if (result.selection === 1) {
                                            if (isAdmin(selectedPlayer)) {
                                                p.sendMessage("§cError, the selected player has recently been added as an admin by another user.");
                                                p.playSound("au.error");

                                            } else {
                                                try {
                                                    for (const admin of admins) {
                                                        if (isOwner(p.name) || !isOwner(admin)) {
                                                            world.scoreboard.getObjective('-au').removeParticipant(admin);
                                                        }
                                                    }
                                                    world.scoreboard.getObjective('-au').setScore(`-au${selectedPlayer}-au`, 0);
                                                    p.sendMessage(`§aAll the previous admins have been deleted, the current admin is: §b${selectedPlayer}§a.`);
                                                } catch (e) {
                                                    p.sendMessage(`§cError, couldn't set §4${selectedPlayer}§c as an admin.`);
                                                    p.playSound("au.error");
                                                }
                                            }
                                        }
                                    });
                            }
                        }
                    });
                }
            } break;
            case 2: { //Add an admin
                addAnAdmin();
                function addAnAdmin() {
                    const nonAdmins = players.filter(player => !isAdmin(player.name)).map(player => player.name);
                    const form = new ActionFormData()
                        .title("Admin settings: add an admin")
                        .body("Select an online player to add as an admin")
                        .button("§l<-- Back", "textures/icons/back.png")
                        .button("Type an offline/online player instead", "textures/icons/pencil.png");
                    for (const player of nonAdmins) {
                        form.button(player, "textures/icons/steve_icon.png");
                    }
                    form.show(p).then((response) => {
                        if (response.canceled === true) return;
                        const { selection } = response;
                        if (selection === 0) {
                            adminSettings(p);

                        } else if (selection === 1) {
                            const form = new ModalFormData()
                                .title("Admin settings: add an admin")
                                .textField("Type below the player you would like to add as an admin.", "Player's name");
                            form.show(p).then(result => {
                                if (result.canceled === true) return;
                                const player = result.formValues[0];

                                if (player === "" || !player) {
                                    p.sendMessage("§cError, please specify the name of the player you would like to add as an admin.");
                                    p.playSound("au.error");

                                } else if (isValidUsername(player) === false) {
                                    p.sendMessage("§cError, the username you entered is invalid.");
                                    p.playSound("au.error");

                                } else if (isAdmin(player)) {
                                    p.sendMessage("§cError, the specified player is already an admin.");
                                    p.playSound("au.error");

                                } else {
                                    try {
                                        world.scoreboard.getObjective('-au').setScore(`-au${player}-au`, 0);
                                        p.sendMessage(`§aThe player §b${player}§a has been added successfully as an admin.`);
                                        p.playSound("au.success");
                                    } catch (e) {
                                        p.sendMessage(`§cError, couldn't add §4${player}§c as an admin.`);
                                        p.playSound("au.error");
                                    }
                                }
                            });

                        } else if (selection >= 2) {
                            const selectedPlayer = nonAdmins[selection - 2];
                            if (isAdmin(selectedPlayer)) {
                                p.sendMessage("§cError, the selected player has recently been added as an admin by another user.");
                                p.playSound("au.error");

                            } else {
                                new MessageFormData()
                                    .title("Admin settings: add an admin")
                                    .body(`Are you sure you want to add §b${selectedPlayer}§r as an admin?`)
                                    .button1("No")
                                    .button2("Yes")
                                    .show(p).then(result => {
                                        if (result.selection === 0) {
                                            addAnAdmin();
                                        } else if (result.selection === 1) {
                                            if (isAdmin(selectedPlayer)) {
                                                p.sendMessage("§cError, the selected player has recently been added as an admin by another user.");
                                                p.playSound("au.error");

                                            } else {
                                                try {
                                                    world.scoreboard.getObjective('-au').setScore(`-au${selectedPlayer}-au`, 0);
                                                    p.sendMessage(`§aThe player §b${selectedPlayer}§a has been added successfully as an admin.`);
                                                    p.playSound("au.success");
                                                } catch (e) {
                                                    p.sendMessage(`§cError, couldn't add §4${selectedPlayer}§c as an admin.`);
                                                    p.playSound("au.error");
                                                }
                                            }
                                        }
                                    });
                            }
                        }
                    });
                }
            } break;
            case 3: { //Remove an admin
                removeAnAdmin();
                function removeAnAdmin() {
                    const locAdmins = admins.map(admin => admin.match(/(?<=^-au)[^]+(?=-au$)/)[0]).filter(admin => isOwner(p.name) || !isOwner(admin));
                    const form = new ActionFormData()
                        .title("Admin settings: remove an admin")
                        .body("Select an offline/online admin to remove")
                        .button("§l<-- Back", "textures/icons/back.png")
                        .button("Type an offline/online admin instead", "textures/icons/pencil.png");
                    for (const admin of locAdmins) {
                        form.button(admin, "textures/icons/steve_icon.png");
                    }
                    form.show(p).then((response) => {
                        if (response.canceled === true) return;
                        const { selection } = response;
                        if (selection === 0) {
                            adminSettings(p);

                        } else if (selection === 1) {
                            new ModalFormData()
                                .title("Admin settings: remove an admin")
                                .textField("Type below the name of the admin you would like to remove.", "Player's name")
                                .show(p).then(result => {
                                    if (result.canceled === true) return;

                                    const admin = result.formValues[0];
                                    if (admin === "" || !admin) {
                                        p.sendMessage("§cError, please specify the name of the admin you would like to remove.");
                                        p.playSound("au.error");

                                    } else if (isValidUsername(admin) === false) {
                                        p.sendMessage("§cError, the username you entered is invalid.");
                                        p.playSound("au.error");

                                    } else if (!isAdmin(admin)) {
                                        p.sendMessage("§cError, the specified player is not an admin.");
                                        p.playSound("au.error");

                                    } else if (isOwner(admin) && !isOwner(p.name)) {
                                        p.sendMessage("§cError, the specified player is the owner.");
                                        p.playSound("au.error");

                                    } else {
                                        try {
                                            world.scoreboard.getObjective('-au').removeParticipant(`-au${admin}-au`);
                                            p.sendMessage(`§aThe admin §b${admin}§a has been removed successfully.`);
                                            p.playSound("au.success");
                                        } catch (e) {
                                            p.sendMessage(`§cError, couldn't remove the admin §4${admin}§c.`);
                                            p.playSound("au.error");
                                        }
                                    }
                                });

                        } else if (selection >= 2) {
                            const selectedAdmin = locAdmins[selection - 2];
                            if (!isAdmin(selectedAdmin)) {
                                p.sendMessage("§cError, the selected admin has recently been removed by another user.");
                                p.playSound("au.error");

                            } else if (isOwner(selectedAdmin) && !isOwner(p.name)) {
                                p.sendMessage("§cError, the selected admin has recently been set as the owner.");
                                p.playSound("au.error");

                            } else {
                                new MessageFormData()
                                    .title("Admin settings: remove an admin")
                                    .body(`Are you sure you want to remove the admin §b${selectedAdmin}§r?`)
                                    .button1("No")
                                    .button2("Yes")
                                    .show(p).then(result => {
                                        if (result.selection === 0) {
                                            removeAnAdmin();
                                        } else if (result.selection === 1) {
                                            if (!isAdmin(selectedAdmin)) {
                                                p.sendMessage("§cError, the selected admin has recently been removed by another user.");
                                                p.playSound("au.error");

                                            } else if (isOwner(selectedAdmin) && !isOwner(p.name)) {
                                                p.sendMessage("§cError, the selected admin has recently been set as the owner.");
                                                p.playSound("au.error");

                                            } else {
                                                try {
                                                    world.scoreboard.getObjective('-au').removeParticipant(`-au${selectedAdmin}-au`);
                                                    p.sendMessage(`§aThe admin §b${selectedAdmin}§a has been removed successfully.`);
                                                    p.playSound("au.success");
                                                } catch (e) {
                                                    p.sendMessage(`§cError, couldn't remove the admin §4${selectedAdmin}§c.`);
                                                    p.playSound("au.error");
                                                }
                                            }
                                        }
                                    });
                            }
                        }
                    });
                }
            } break;
            case 4: { //Show admins
                if (!isAdmin(p.name)) {
                    p.sendMessage("§cError, you have recently been removed from the admins by another user.");
                    p.playSound("au.error");

                } else {
                    const adminsArray = world.scoreboard.getObjective('-au').getParticipants().map(admin => admin.displayName.match(/(?<=^-au)[^]+(?=-au$)/)[0]);
                    new ModalFormData()
                        .title("Admin settings: show admins")
                        .dropdown("Admins list", adminsArray)
                        .show(p).then(result => {
                            adminSettings(p);
                        });
                }
            } break;
            default:
                break;
        }
    });
}

export function adminUtils(p) {
    const form = new ActionFormData()
        .title("§l§b§kkdk§r§l§cAdmin §autils§b§kkdk")
        .body("")
        .button("<-- Back", "textures/icons/back.png") //0
        .button("§lBan or unban menu", "textures/icons/ban.png") //1
        .button("§lJail menu", "textures/icons/jail.png") //2
        .button("§lVanish menu", "textures/icons/vanish.png") //3
        .button("§lFreeze menu", "textures/icons/freeze.png") //4
        .button("§lSee an inventory", "textures/icons/chest.png") //5
        .button("§lFreecam menu", "textures/icons/camera.png") //6
        // .button("§lSimulated player", "textures/icons/simPlayers.png")
        .button("§lProjectile powers", "textures/icons/projPowers.png") //7
        .button("§lKill a player", "textures/icons/simAttack.png") //8
        .button("§lLaunch a player", "textures/icons/launch.png") //9
    form.show(p).then((response) => {
        switch (response.selection) {
            case 0: { //Back
                adminUtilsGui(p);
            } break;
            case 1: { //Ban or unban menu
                banUnbanMenu(p);
            } break;
            case 2: { //Jail menu
                jailMenu(p);
            } break;
            case 3: { //Vanish menu
                vanishMenu(p);
            } break;
            case 4: { //Freeze or unfreeze a player
                freezeUnfreeze();
                function freezeUnfreeze() {
                    const form = new ActionFormData()
                        .title("Freeze or unfreeze a player")
                        .body("Select an option")
                        .button("§l<-- Back", "textures/icons/back.png")
                        .button("Freeze a player", "textures/icons/freeze.png")
                        .button("Unfreeze a player", "textures/icons/unFreeze.png");
                    form.show(p).then((response) => {
                        if (response.selection === 0) {
                            adminUtils(p);
                        } else if (response.selection === 1) {
                            freezePlayer();
                            function freezePlayer() {
                                const locPlayers = players.filter(player => !isFrozen(player.name));
                                const form = new ActionFormData()
                                    .title("Freeze a player")
                                    .body("Select an online player to freeze.\nIf you don't see someone here, it means they're already frozen.")
                                    .button("§l<-- Back", "textures/icons/back.png")
                                    .button("Type an offline/online player manually instead", "textures/icons/pencil.png");
                                for (const player of locPlayers) {
                                    form.button(player.name, "textures/icons/steve_icon.png");
                                }

                                form.show(p).then((response) => {
                                    if (response.selection === 0) {
                                        freezeUnfreeze();
                                    } else if (response.selection === 1) {
                                        const form = new ModalFormData()
                                            .title("Freeze a player")
                                            .textField("Type below the player you would like to freeze. In case the player is offline, they will get frozen as soon as they join the world.", "Player's name");
                                        form.show(p).then(async result => {
                                            if (result.canceled === true) return;
                                            const playerName = result.formValues[0];
                                            if (!isValidUsername(playerName)) {
                                                await runTellraw(p, '§cError, the username you entered is invalid.');
                                                p.playSound("au.error");

                                            } else if (isFrozen(playerName)) {
                                                await runTellraw(p, '§cError, the player is already frozen.');
                                                p.playSound("au.error");

                                            } else {
                                                try {
                                                    const query = {
                                                        name: playerName
                                                    };
                                                    const selectedPlayer = [...world.getPlayers(query)][0];
                                                    if (selectedPlayer !== undefined) {
                                                        await runCmd(p, `scoreboard players set "-auname${playerName} -au${selectedPlayer.location.x} -au${selectedPlayer.location.y} -au${selectedPlayer.location.z}" -auFrozen 0`);
                                                        await runTellraw(p, `§aThe player §b${playerName}§a has been successfully frozen.`);
                                                        p.playSound("au.success");
                                                    } else {
                                                        await runCmd(p, `scoreboard players set "-auname${playerName} -au+ -au+ -au+" -auFrozen 0`);
                                                        await runTellraw(p, `§aThe player §b${playerName}§a has been successfully frozen.`);
                                                        p.playSound("au.success");
                                                    }
                                                } catch (e) {
                                                    await runTellraw(p, `§cError, the player couldn't be frozen.`);
                                                    p.playSound("au.error");
                                                }
                                            }
                                        });
                                    } else if (response.selection >= 2) {
                                        const selectedPlayer = locPlayers[response.selection - 2];
                                        const form = new MessageFormData()
                                            .title("Freeze a player")
                                            .body(`Are you sure you want to freeze §b${selectedPlayer.name}§r?`)
                                            .button1("No")
                                            .button2("Yes");
                                        form.show(p).then(async result => {
                                            if (result.selection === 0) {
                                                freezePlayer();
                                            } else if (result.selection === 1) {
                                                if (isFrozen(selectedPlayer.name)) {
                                                    await runTellraw(p, "§cError, the selected player has recently been frozen by another user.");
                                                    p.playSound("au.error");

                                                } else {
                                                    try {
                                                        await runCmd(selectedPlayer.dimension, `scoreboard players set "-auname${selectedPlayer.name} -au${selectedPlayer.location.x} -au${selectedPlayer.location.y} -au${selectedPlayer.location.z}" -auFrozen 0`);
                                                        await runTellraw(p, `§aThe player §b${selectedPlayer.name}§a has been successfully frozen.`);
                                                        p.playSound("au.success");
                                                    } catch (e) {
                                                        await runTellraw(p, `§cError, the player couldn't be frozen.`);
                                                        p.playSound("au.error");
                                                    }
                                                }
                                            }
                                        });
                                    }
                                });
                            }
                        } else if (response.selection === 2) {
                            unFreezePlayer();
                            function unFreezePlayer() {
                                const frozenPlayers = [...world.scoreboard.getObjective('-auFrozen').getParticipants().map(participant => participant.displayName.match(/-auname([^]*) -au-?(?:[0-9]+[^]*|\+) -au-?(?:[0-9]+[^]*|\+) -au-?(?:[0-9]+[^]*|\+)/)[1])];
                                const form = new ActionFormData()
                                    .title("Unfreeze a player")
                                    .body("Select an online/offline frozen player to unfreeze")
                                    .button("§l<-- Back", "textures/icons/back.png");
                                for (const player of frozenPlayers) {
                                    form.button(player, "textures/icons/steve_icon.png");
                                }

                                form.show(p).then((response) => {
                                    if (response.selection === 0) {
                                        freezeUnfreeze();
                                    } else if (response.selection >= 1) {
                                        const selectedPlayer = frozenPlayers[response.selection - 1];
                                        const form = new MessageFormData()
                                            .title("Unfreeze a player")
                                            .body(`Are you sure you want to unfreeze §b${selectedPlayer}§r?`)
                                            .button1("No")
                                            .button2("Yes");
                                        form.show(p).then(async result => {
                                            if (result.selection === 0) {
                                                unFreezePlayer();
                                            } else if (result.selection === 1) {
                                                if (!isFrozen(selectedPlayer)) {
                                                    await runTellraw(p, "§cError, the selected player has recently been unfrozen by another user.");
                                                    p.playSound("au.error");

                                                } else {
                                                    try {
                                                        const scoreboard = world.scoreboard.getObjective('-auFrozen').getParticipants().filter(participant => participant.displayName.match(/-auname([^]*) -au-?(?:[0-9]+[^]*|\+) -au-?(?:[0-9]+[^]*|\+) -au-?(?:[0-9]+[^]*|\+)/)[1] === selectedPlayer)[0].displayName;
                                                        await runCmd(p, `scoreboard players reset "${scoreboard}" -auFrozen`);
                                                        await runTellraw(p, `§aThe player §b${selectedPlayer}§a has been successfully unfrozen.`);
                                                        p.playSound("au.success");
                                                    } catch (e) {
                                                        await runTellraw(p, `§cError, the player couldn't be unfrozen.`);
                                                        p.playSound("au.error");
                                                    }
                                                }
                                            }
                                        });
                                    }
                                });
                            }
                        }
                    });
                }
            } break;
            case 5: { //See an inventory
                seeInventoryMenu(p);
            } break;
            case 6: { //Freecam
                freeCam.init(p);
            } break;
            case 7: { //Projectile powers
                projectilePowers(p);
            } break;
            case 8: { //Kill a player
                const playersArray = players.map(pname => pname.name);
                const form = new ActionFormData()
                    .title("Kill a player")
                    .body("Select an online player to kill")
                    .button("§l<-- Back", "textures/icons/back.png")
                    .button("Type an online player instead", "textures/icons/pencil.png");
                for (const player of playersArray) {
                    form.button(player, "textures/icons/steve_icon.png");
                }

                form.show(p).then((response) => {
                    if (response.selection === 0) {
                        adminUtils(p);
                    } else if (response.selection === 1) {
                        const form = new ModalFormData()
                            .title("Kill a player")
                            .textField("Type below the player you would like to kill.", "Player's name")
                            .toggle("Force death", true);
                        form.show(p).then(async result => {
                            if (result.canceled === true) return;
                            const playerName = result.formValues[0];

                            if (!isValidUsername(playerName)) {
                                await runTellraw(p, `§cError, the username you entered is invalid.`);
                                p.playSound("au.error");

                            } else if (result.formValues[1] === true) { //Force death true
                                try {
                                    const { successCount: _successCount } = p.runCommand(`testfor "${playerName}"`);
                                    if (_successCount === 0) {
                                        throw '';
                                    }

                                    const rawPlayer = world.getPlayers({ name: playerName, gameMode: GameMode.survival })[0];
                                    const rawPlayer2 = world.getPlayers({ name: playerName, gameMode: GameMode.adventure })[0];
                                    if (!rawPlayer && !rawPlayer2) {
                                        let gamemode = "survival";
                                        if (world.getPlayers({ name: playerName, gameMode: GameMode.creative })[0]) {
                                            gamemode = "creative";
                                        } else if (world.getPlayers({ name: playerName, gameMode: GameMode.spectator })[0]) {
                                            gamemode = "spectator;"
                                        }

                                        p.runCommand(`tag "${playerName}" add "-aukill${gamemode}"`);
                                        p.runCommand(`gamemode survival "${playerName}"`);
                                    }
                                    p.runCommand(`kill "${playerName}"`);
                                    await delay(2);

                                    const { successCount } = p.runCommand(`testfor "${playerName}"`);
                                    if (successCount === 1) {
                                        throw '';
                                    }
                                    await runTellraw(p, `§aThe player §b${playerName}§a has been killed successfully.`);
                                    p.playSound("au.success");
                                } catch (e) {
                                    await runTellraw(p, `§cError, the player couldn't be killed or wasn't found.`);
                                    p.playSound("au.error");
                                }
                            } else if (result.formValues[1] === false) { //Force death false
                                try {
                                    const { successCount: _successCount } = p.runCommand(`testfor "${playerName}"`);
                                    if (_successCount === 0) { //If the player is already dead or offline
                                        throw '';
                                    }

                                    await runCmd(p, `kill "${playerName}"`);

                                    const { successCount } = p.runCommand(`testfor "${playerName}"`);
                                    if (successCount === 1) { //If the player is still alive
                                        throw '';
                                    } else {
                                        await runTellraw(p, `§aThe player §b${playerName}§a has been killed successfully.`);
                                        p.playSound("au.success");
                                    }
                                } catch (e) {
                                    await runTellraw(p, `§cError, the player couldn't be killed or wasn't found.`);
                                    p.playSound("au.error");
                                }
                            }
                        });
                    } else if (response.selection > 1) {
                        const selectedPlayersName = playersArray[response.selection - 2];

                        const form = new ModalFormData()
                            .title("Kill a player")
                            .toggle("Force death", true);
                        form.show(p).then(async result => {
                            if (result.canceled === true) return;
                            if (result.formValues[0] === true) { //Force death true
                                try {
                                    const { successCount: _successCount } = p.runCommand(`testfor "${selectedPlayersName}"`);
                                    if (_successCount === 0) {
                                        throw '';
                                    }

                                    const rawPlayer = world.getPlayers({ name: selectedPlayersName, gameMode: GameMode.survival })[0];
                                    const rawPlayer2 = world.getPlayers({ name: selectedPlayersName, gameMode: GameMode.adventure })[0];
                                    if (!rawPlayer && !rawPlayer2) {
                                        let gamemode = "survival";
                                        if (world.getPlayers({ name: selectedPlayersName, gameMode: GameMode.creative })[0]) {
                                            gamemode = "creative";
                                        } else if (world.getPlayers({ name: selectedPlayersName, gameMode: GameMode.spectator })[0]) {
                                            gamemode = "spectator;"
                                        }

                                        p.runCommand(`tag "${selectedPlayersName}" add "-aukill${gamemode}"`);
                                        p.runCommand(`gamemode survival "${selectedPlayersName}"`);
                                    }

                                    p.runCommand(`kill "${selectedPlayersName}"`);
                                    await delay(2);

                                    const { successCount } = p.runCommand(`testfor "${selectedPlayersName}"`);
                                    if (successCount === 1) {
                                        throw '';
                                    }
                                    await runTellraw(p, `§aThe player §b${selectedPlayersName}§a has been killed successfully.`);
                                    p.playSound("au.success");
                                } catch (e) {
                                    await runTellraw(p, `§cError, the player couldn't be killed or wasn't found.`);
                                    p.playSound("au.error");
                                }
                            } else if (result.formValues[0] === false) { //Force death false
                                try {
                                    const { successCount: _successCount } = p.runCommand(`testfor "${selectedPlayersName}"`);
                                    if (_successCount === 0) { //If the player is already dead or offline
                                        throw '';
                                    }

                                    await runCmd(p, `kill "${selectedPlayersName}"`);

                                    const { successCount } = p.runCommand(`testfor "${selectedPlayersName}"`);
                                    if (successCount === 1) { //If the player is still alive
                                        throw '';
                                    } else {
                                        await runTellraw(p, `§aThe player §b${selectedPlayersName}§a has been killed successfully.`);
                                        p.playSound("au.success");
                                    }
                                } catch (e) {
                                    await runTellraw(p, `§cError, the player couldn't be killed or wasn't found.`);
                                    p.playSound("au.error");
                                }
                            }
                        });
                    }
                });
            } break;
            case 9: { //Launch a player
                launchPlayer();
                function launchPlayer() {
                    const locPlayers = players;
                    const form = new ActionFormData()
                        .title("Launch a player")
                        .body("Select an online player to launch")
                        .button("§l<-- Back", "textures/icons/back.png")
                        .button("Type an online player instead", "textures/icons/pencil.png");
                    for (const player of locPlayers) {
                        form.button(player.name, "textures/icons/steve_icon.png");
                    }

                    form.show(p).then((response) => {
                        if (response.selection === 0) {
                            adminUtils(p);
                        } else if (response.selection === 1) {
                            const form = new ModalFormData()
                                .title("Launch a player")
                                .textField("Type below the player you would like to launch", "Player's name");
                            form.show(p).then(async result => {
                                const player = result.formValues[0];

                                if (!isValidUsername(player)) {
                                    await runTellraw(p, '§cError, the username you entered is invalid.');
                                    p.playSound("au.error");
                                } else {
                                    const { successCount } = await runCmd(p, `testfor "${player}"`);
                                    if (successCount === 0) {
                                        await runTellraw(p, '§cError, the player you entered is not online.');
                                        p.playSound("au.error");
                                    } else {
                                        try {
                                            const query = {
                                                name: player
                                            };
                                            const playerRaw = [...world.getPlayers(query)][0];
                                            playerRaw.runCommand('playsound player_launch @a ~ ~ ~ 100');
                                            await runCmd(playerRaw, `execute @s ~~~ summon fireworks_rocket`);
                                            for (let i = 0; i < 5; i++) {
                                                runCmd(playerRaw, `execute @s ~~~ particle minecraft:cauldron_explosion_emitter`);
                                            }
                                            particles();
                                            async function particles() {
                                                for (let i = 0; i < 23; i++) {
                                                    await delay(0.05);
                                                    playerRaw.runCommand(`execute @s ~~~ particle minecraft:explosion_manual`);
                                                }
                                            }
                                            await runCmd(playerRaw, `effect @s levitation 3 150 true`);
                                            await runTellraw(p, `§aThe player §b${player}§a has been launched successfully.`);
                                            p.playSound("au.success");
                                        } catch (e) {
                                            await runTellraw(p, `§cError, the player §4${player}§c couldn't be launched.`);
                                            p.playSound("au.error");
                                        }
                                    }
                                }
                            });
                        } else if (response.selection > 1) {
                            const selectedPlayerRaw = locPlayers[response.selection - 2];

                            const form = new MessageFormData()
                                .title("Launch a player")
                                .body(`Are you sure you want to launch §b${selectedPlayerRaw.name}§r?`)
                                .button1("No")
                                .button2("Yes");
                            form.show(p).then(async result => {
                                if (result.canceled === true) return;
                                if (result.selection === 0) {
                                    launchPlayer();
                                } else if (result.selection === 1) {
                                    try {
                                        selectedPlayerRaw.runCommand('playsound player_launch @a ~ ~ ~ 100');
                                        await runCmd(selectedPlayerRaw, `execute @s ~~~ summon fireworks_rocket`);
                                        for (let i = 0; i < 5; i++) {
                                            runCmd(selectedPlayerRaw, `execute @s ~~~ particle minecraft:cauldron_explosion_emitter`);
                                        }
                                        particles();
                                        async function particles() {
                                            for (let i = 0; i < 23; i++) {
                                                await delay(0.05);
                                                selectedPlayerRaw.runCommand(`execute @s ~~~ particle minecraft:explosion_manual`);
                                            }
                                        }
                                        await runCmd(selectedPlayerRaw, `effect @s levitation 3 150 true`);
                                        await runTellraw(p, `§aThe player §b${selectedPlayerRaw.name}§a has been launched successfully.`);
                                        p.playSound("au.success");
                                    } catch (e) {
                                        await runTellraw(p, `§cError, the player §4${selectedPlayerRaw.name}§c couldn't be launched.`);
                                        p.playSound("au.error");
                                    }
                                }
                            });
                        }
                    });
                }
            } break;
        }
    });
}

function banUnbanMenu(p) {
    const form = new ActionFormData()
        .title("Ban/unban menu")
        .body("Select an option")
        .button("§l<-- Back", "textures/icons/back.png")
        .button("Ban a player", "textures/icons/ban.png")
        .button("Unban a player", "textures/icons/tick.png");
    form.show(p).then((response) => {
        if (response.selection === 0) {
            adminUtils(p);
        } else if (response.selection === 1) {
            banPlayer(p);
        } else if (response.selection === 2) {
            unBanPlayer(p);
        }
    });
}

function banPlayer(p) {
    const playersArray = players.map(pname => pname.name);
    let notBannedPlayers = [];

    const form = new ActionFormData();
    form.title("Ban menu");
    form.body("Select an online player to ban (you cannot ban an admin)");
    form.button("§l<-- Back", "textures/icons/back.png");
    form.button("Type an offline/online player instead", "textures/icons/pencil.png");
    for (const player of playersArray) {
        if (!isBanned(player) && !isAdmin(player) && !isOwner(player)) {
            form.button(player, "textures/icons/steve_icon.png");
            notBannedPlayers.push(player);
        }
    }

    form.show(p).then((response) => {
        if (response.selection === 0) {
            banUnbanMenu(p);
        } else if (response.selection === 1) {
            let form = new ModalFormData()
                .title("Ban menu")
                .textField("Type below the player you would like to ban.", "Player's name") //0
                .textField("Enter a reason:", "Reason") //1
                .toggle("Permanent ban", false) //2
                .slider("Years", 0, 10, 1, 0) //3
                .slider("Months", 0, 11, 1, 0) //4
                .slider("Weeks", 0, 3, 1, 0) //5
                .slider("Days", 0, 6, 1, 0) //6
                .slider("Hours", 0, 23, 1, 0) //7
                .slider("Minutes", 0, 59, 1, 0) //8
                .slider("Seconds", 0, 59, 1, 0); //9
            form.show(p).then(async result => {
                if (result.canceled === true) return;
                const player = result.formValues[0];
                const reason = result.formValues[1];
                const isPermaBanned = result.formValues[2];
                const bannedBy = p.name;
                if (isPermaBanned === true) {
                    if (reason.trim() === "") {
                        await runTellraw(p, `§cError, you must enter a reason.`);
                        p.playSound("au.error");

                    } else if (!isValidUsername(player)) {
                        await runTellraw(p, `§cError, the username you entered is invalid.`);
                        p.playSound("au.error");

                    } else if (isBanned(player)) {
                        await runTellraw(p, `§cError, the specified player is already banned.`);
                        p.playSound("au.error");

                    } else if (isAdmin(player)) {
                        await runTellraw(p, `§cError, the specified player is an admin, cannot ban.`);
                        p.playSound("au.error");

                    } else if (isOwner(player)) {
                        await runTellraw(p, `§cError, the specified player is the owner, cannot ban.`);
                        p.playSound("au.error");

                    } else {
                        try {
                            await runCmd(overworld, `scoreboard players set "${player}-aureason${reason}-auban${bannedBy}-autime-aupermabanned-au" -auBan 0`);
                            try {
                                await runCmd(overworld, `kick "${player}" "\n§l§6----------------------------\n§l§4§k|||||§r§l§cYou have been permanently banned by §4${bannedBy}§4§k|||||§r\n§l§o§4Reason: §c${reason}\n§r§l§6----------------------------§r"`);
                            } catch (e) { }
                            await runTellraw(p, `§aThe player §b${player}§a has been banned successfully with reason: §c${reason}\n§7* §2Time: §3Permanently`);
                            p.playSound("au.success");
                        } catch (e) {
                            await runTellraw(p, `§cError, couldn't ban the player.`);
                            p.playSound("au.error");
                        }
                    }
                } else {
                    const banYears = result.formValues[3];
                    const banMonths = result.formValues[4];
                    const banWeeks = result.formValues[5]; //Only to calculate the respective days and add them to banDays
                    const banDays = result.formValues[6]; //Specified days without taking the weeks into account, include this in the kick cmd
                    const banTotalDays = banDays + banWeeks * 7;
                    const banHours = result.formValues[7];
                    const banMinutes = result.formValues[8];
                    const banSeconds = result.formValues[9];

                    const unBanDate = moment();
                    unBanDate.add(banYears, 'years');
                    unBanDate.add(banMonths, 'months');
                    unBanDate.add(banTotalDays, 'days');
                    unBanDate.add(banHours, 'hours');
                    unBanDate.add(banMinutes, 'minutes');
                    unBanDate.add(banSeconds, 'seconds');

                    const unBanISO = unBanDate.toISOString(); //Date when you will get unbanned

                    if (reason.trim() === "") {
                        await runTellraw(p, `§cError, you must enter a reason.`);
                        p.playSound("au.error");

                    } else if (result.formValues.slice(3).every(value => value === 0)) { //If all time values are 0
                        await runTellraw(p, `§cError, you must specify a ban time.`);
                        p.playSound("au.error");

                    } else if (!isValidUsername(player)) {
                        await runTellraw(p, `§cError, the username you entered is invalid.`);
                        p.playSound("au.error");

                    } else if (isBanned(player)) {
                        await runTellraw(p, `§cError, the specified player is already banned.`);
                        p.playSound("au.error");

                    } else if (isAdmin(player)) {
                        await runTellraw(p, `§cError, the specified player is an admin, cannot ban.`);
                        p.playSound("au.error");

                    } else if (isOwner(player)) {
                        await runTellraw(p, `§cError, the specified player is the owner, cannot ban.`);
                        p.playSound("au.error");

                    } else {
                        try {
                            await runCmd(overworld, `scoreboard players set "${player}-aureason${reason}-auban${bannedBy}-autime${unBanISO}" -auBan 0`);
                            const years = banYears === 0 ? "" : banYears === 1 ? `${banYears} year ` : `${banYears} years `;
                            const months = banMonths === 0 ? "" : banMonths === 1 ? `${banMonths} month ` : `${banMonths} months `;
                            const weeks = banWeeks === 0 ? "" : banWeeks === 1 ? `${banWeeks} week ` : `${banWeeks} weeks `;
                            const days = banDays === 0 ? "" : banDays === 1 ? `${banDays} day ` : `${banDays} days `;
                            const hours = banHours === 0 ? "" : banHours === 1 ? `${banHours} hour ` : `${banHours} hours `;
                            const minutes = banMinutes === 0 ? "" : banMinutes === 1 ? `${banMinutes} minute ` : `${banMinutes} minutes `;
                            const seconds = banSeconds === 0 ? "" : banSeconds === 1 ? `${banSeconds} second` : `${banSeconds} seconds`;
                            try {
                                await runCmd(overworld, `kick "${player}" "\n§l§6----------------------------\n§l§4§k|||||§r§l§cYou have been temporarily banned by §4${bannedBy}§4§k|||||§r\n§l§o§4Reason: §c${reason}\n§4Time: §c${years}${months}${weeks}${days}${hours}${minutes}${seconds}\n§r§l§6----------------------------§r"`);
                            } catch (e) { }
                            await runTellraw(p, `§aThe player §b${player}§a has been banned successfully with reason: §c${reason}\n§7* §2Time: §3${years}${months}${weeks}${days}${hours}${minutes}${seconds}`);
                            p.playSound("au.success");
                        } catch (e) {
                            await runTellraw(p, `§cError, couldn't ban the player.`);
                            p.playSound("au.error");
                        }
                    }
                }
            });
        } else if (response.selection > 1) {
            const selectedPlayer = notBannedPlayers[response.selection - 2];

            let form = new ModalFormData()
                .title("Ban menu")
                .textField("Enter a reason:", "Reason") //0
                .toggle("Permanent ban", false) //1
                .slider("Years", 0, 10, 1, 0) //2
                .slider("Months", 0, 11, 1, 0) //3
                .slider("Weeks", 0, 3, 1, 0) //4
                .slider("Days", 0, 6, 1, 0) //5
                .slider("Hours", 0, 23, 1, 0) //6
                .slider("Minutes", 0, 59, 1, 0) //7
                .slider("Seconds", 0, 59, 1, 0); //8
            form.show(p).then(async result => {
                if (result.canceled === true) return;
                const reason = result.formValues[0];
                const isPermaBanned = result.formValues[1];
                const bannedBy = p.name;
                if (isPermaBanned === true) {
                    if (reason.trim() === "") {
                        await runTellraw(p, `§cError, you must enter a reason.`);
                        p.playSound("au.error");

                    } else if (isBanned(selectedPlayer)) {
                        await runTellraw(p, `§cError, the selected player has recently been banned by another user.`);
                        p.playSound("au.error");

                    } else if (isAdmin(selectedPlayer)) {
                        await runTellraw(p, `§cError, the selected player has recently been set as an admin, cannot ban.`);
                        p.playSound("au.error");

                    } else if (isOwner(selectedPlayer)) {
                        await runTellraw(p, `§cError, the selected player has recently been set as the owner, cannot ban.`);
                        p.playSound("au.error");

                    } else {
                        try {
                            await runCmd(overworld, `scoreboard players set "${selectedPlayer}-aureason${reason}-auban${bannedBy}-autime-aupermabanned-au" -auBan 0`);
                            try {
                                await runCmd(overworld, `kick "${selectedPlayer}" "\n§l§6----------------------------\n§l§4§k|||||§r§l§cYou have been permanently banned by §4${bannedBy}§4§k|||||§r\n§l§o§4Reason: §c${reason}\n§r§l§6----------------------------§r"`);
                            } catch (e) { }
                            await runTellraw(p, `§aThe player §b${selectedPlayer}§a has been banned successfully with reason: §c${reason}\n§7* §2Time: §3Permanently`);
                            p.playSound("au.success");
                        } catch (e) {
                            await runTellraw(p, `§cError, couldn't ban the player.`);
                            p.playSound("au.error");
                        }
                    }
                } else {
                    const banYears = result.formValues[2];
                    const banMonths = result.formValues[3];
                    const banWeeks = result.formValues[4]; //Only to calculate the respective days and add them to banDays
                    const banDays = result.formValues[5]; //Specified days without taking the weeks into account, include this in the kick cmd
                    const banTotalDays = banDays + banWeeks * 7;
                    const banHours = result.formValues[6];
                    const banMinutes = result.formValues[7];
                    const banSeconds = result.formValues[8];

                    const unBanDate = moment();
                    unBanDate.add(banYears, 'years');
                    unBanDate.add(banMonths, 'months');
                    unBanDate.add(banTotalDays, 'days');
                    unBanDate.add(banHours, 'hours');
                    unBanDate.add(banMinutes, 'minutes');
                    unBanDate.add(banSeconds, 'seconds');

                    const unBanISO = unBanDate.toISOString(); //Date when you will get unbanned

                    if (reason.trim() === "") {
                        await runTellraw(p, `§cError, you must enter a reason.`);
                        p.playSound("au.error");

                    } else if (result.formValues.slice(2).every(value => value === 0)) { //If all time values are 0
                        await runTellraw(p, `§cError, you must specify a ban time.`);
                        p.playSound("au.error");

                    } else if (isBanned(selectedPlayer)) {
                        await runTellraw(p, `§cError, the selected player has recently been banned by another user.`);
                        p.playSound("au.error");

                    } else if (isAdmin(selectedPlayer)) {
                        await runTellraw(p, `§cError, the selected player has recently been set as an admin, cannot ban.`);
                        p.playSound("au.error");

                    } else if (isOwner(selectedPlayer)) {
                        await runTellraw(p, `§cError, the selected player has recently been set as the owner, cannot ban.`);
                        p.playSound("au.error");

                    } else {
                        try {
                            await runCmd(overworld, `scoreboard players set "${selectedPlayer}-aureason${reason}-auban${bannedBy}-autime${unBanISO}" -auBan 0`);
                            const years = banYears === 0 ? "" : banYears === 1 ? `${banYears} year ` : `${banYears} years `;
                            const months = banMonths === 0 ? "" : banMonths === 1 ? `${banMonths} month ` : `${banMonths} months `;
                            const weeks = banWeeks === 0 ? "" : banWeeks === 1 ? `${banWeeks} week ` : `${banWeeks} weeks `;
                            const days = banDays === 0 ? "" : banDays === 1 ? `${banDays} day ` : `${banDays} days `;
                            const hours = banHours === 0 ? "" : banHours === 1 ? `${banHours} hour ` : `${banHours} hours `;
                            const minutes = banMinutes === 0 ? "" : banMinutes === 1 ? `${banMinutes} minute ` : `${banMinutes} minutes `;
                            const seconds = banSeconds === 0 ? "" : banSeconds === 1 ? `${banSeconds} second` : `${banSeconds} seconds`;
                            try {
                                await runCmd(overworld, `kick "${selectedPlayer}" "\n§l§6----------------------------\n§l§4§k|||||§r§l§cYou have been temporarily banned by §4${bannedBy}§4§k|||||§r\n§l§o§4Reason: §c${reason}\n§4Time: §c${years}${months}${weeks}${days}${hours}${minutes}${seconds}\n§r§l§6----------------------------§r"`);
                            } catch (e) { }
                            await runTellraw(p, `§aThe player §b${selectedPlayer}§a has been banned successfully with reason: §c${reason}\n§7* §2Time: §3${years}${months}${weeks}${days}${hours}${minutes}${seconds}`);
                            p.playSound("au.success");
                        } catch (e) {
                            await runTellraw(p, `§cError, couldn't ban the player.`);
                            p.playSound("au.error");
                        }
                    }
                }
            });
        }
    });
}

function unBanPlayer(p) {
    const form = new ActionFormData()
        .title("Unban menu")
        .body("Select an offline/online banned player to unban")
        .button("§l<-- Back", "textures/icons/back.png")
        .button("Type an offline/online player instead", "textures/icons/pencil.png");

    const bannedPlayers = getBannedPlayers();
    for (const player of bannedPlayers) {
        form.button(player, "textures/icons/steve_icon.png");
    }

    form.show(p).then((response) => {
        if (response.selection === 0) {
            banUnbanMenu(p);
        } else if (response.selection === 1) {
            new ModalFormData()
                .title("Unban menu")
                .textField("Type below the player you would like to unban.", "Player's name")
                .show(p).then(async result => {
                    const player = result.formValues[0];
                    const reason = getBanReason(player);
                    const bannedBy = getBannedBy(player);
                    const banISO = getUnBanISO(player);

                    if (!isBanned(player)) {
                        await runTellraw(p, `§cError, the specified player is not banned.`);
                        p.playSound("au.error");

                    } else if (!isValidUsername(player)) {
                        await runTellraw(p, `§cError, the username you entered is invalid.`);
                        p.playSound("au.error");

                    } else if (isBanned(player) && isValidUsername(player)) {
                        try {
                            await runCmd(overworld, `scoreboard players reset "${player}-aureason${reason}-auban${bannedBy}-autime${banISO}" -auBan`);
                            await runTellraw(p, `§aThe player §b${player}§a has been unbanned successfully.`);
                            p.playSound("au.success");
                        } catch (e) {
                            await runTellraw(p, `§cError, couldn't unban the player, perhaps the ban time is now over.`);
                            p.playSound("au.error");
                        }
                    }
                });
        } else if (response.selection > 1) {
            const selectedPlayer = bannedPlayers[response.selection - 2];

            const form = new MessageFormData()
                .title("Unban menu")
                .body(`Are you sure you want to unban §b${selectedPlayer}§r?`)
                .button1("No")
                .button2("Yes");
            form.show(p).then(async result => {
                if (result.selection === 0) {
                    unBanPlayer(p);
                } else if (result.selection === 1) {
                    const reason = getBanReason(selectedPlayer);
                    const bannedBy = getBannedBy(selectedPlayer);
                    const banISO = getUnBanISO(selectedPlayer);
                    try {
                        await runCmd(overworld, `scoreboard players reset "${selectedPlayer}-aureason${reason}-auban${bannedBy}-autime${banISO}" -auBan`);
                        await runTellraw(p, `§aThe player §b${selectedPlayer}§a has been unbanned successfully.`);
                        p.playSound("au.success");
                    } catch (e) {
                        await runTellraw(p, `§cError, couldn't unban the player, perhaps the ban time is now over.`);
                        p.playSound("au.error");
                    }
                }
            });
        }
    });
}

function jailMenu(p) {
    const form = new ActionFormData()
        .title("Jail menu")
        .body("Select an option")
        .button("§l<-- Back", "textures/icons/back.png") //0
        .button("Learn how to use", "textures/icons/howToUse.png") //1
        .button("Jail a player", "textures/icons/jail.png") //2
        .button("Release a player", "textures/icons/jailRelease.png") //3
        .button("Jail location config", "textures/icons/settings1.png") //4
        .button("Jail exit location config", "textures/icons/settings2.png"); //5
    form.show(p).then((response) => {
        switch (response.selection) {
            case 0:
                adminUtils(p);
                break;
            case 1:
                jailLearn(p);
                break;
            case 2:
                jailPlayer(p);
                break;
            case 3:
                releasePlayer(p);
                break;
            case 4:
                jailLocConfig(p);
                break;
            case 5:
                jailExitLocConfig(p);
                break;
            default:
                break;
        }
    });
}

function jailLearn(p) {
    p.sendMessage("§l§o§6§k====§r§l§o§6============================§k====§r\n§aWith this system you can jail any player §b(except admins)§a as a punishment for anything bad they've done. You can jail them for a certain period of time or permanently, they won't be able to hurt other players or break blocks.\nThere are §b3 main things§a you need in order to imprison someone properly:\n  §7* §3A jail location.\n  §7* §3A jail exit location.\n  §7* §3A safe place where they cannot escape.\n\n§a§oA player is §bteleported§a to the jail exit location when his §bjail time is over§a or an admin §breleases§a him, but it's not compulsory to be set, §bcontrary to the jail location.§a If the jail exit location is removed while a player is in prison, they §bwill be forced to stay§a until a new location is set.\n§l§6§k====§r§l§o§6============================§k====§r");
    p.playSound("random.levelup", { volume: 0.6 });
}

function jailPlayer(p) {
    if (!isJailLocSet()) {
        const form = new MessageFormData()
            .title("Jail a player")
            .body("You haven't set the §ljail location§r yet.\n§lWould you like to set it up now?§r (remember you also need to set the §ljail exit location§r in order for the jailed players to be able to leave)")
            .button1("No")
            .button2("Yes");
        form.show(p).then(result => {
            if (result.selection === 0) {
                jailMenu(p);
            } else if (result.selection === 1) {
                jailLocConfig(p);
            }
        });
    } else {
        let availablePlayers = [];

        const form = new ActionFormData()
            .title("Jail a player");
        if (!isJailExitLocSet()) {
            form.body("Select an online player to jail (you cannot jail an admin).\n§4WARNING§c, you haven't set a §ljail exit location§r§c yet, players won't be able to leave the jail until a location is set.");
        } else {
            form.body("Select an online player to jail (you cannot jail an admin)");
        }
        form.button("§l<-- Back", "textures/icons/back.png");
        form.button("Type an offline/online player instead", "textures/icons/pencil.png");

        for (const player of players.map(player => player.name)) {
            if (!isJailed(player)) {
                if (!isAdmin(player) && !isOwner(player)) {
                    form.button(player, "textures/icons/steve_icon.png");
                    availablePlayers.push(player);
                }
            }
        }

        form.show(p).then(async (response) => {
            if (response.canceled === true) return;
            if (response.selection === 0) {
                jailMenu(p);
            } else if (response.selection === 1) {
                const form = new ModalFormData()
                    .title("Jail a player")
                    .textField("Type below the player you would like to jail.", "Player's name") //0
                    .textField("Enter a reason:", "Reason") //1
                    .toggle("Permanent jail", false) //2
                    .slider("Years", 0, 10, 1, 0) //3
                    .slider("Months", 0, 11, 1, 0) //4
                    .slider("Weeks", 0, 3, 1, 0) //5
                    .slider("Days", 0, 6, 1, 0) //6
                    .slider("Hours", 0, 23, 1, 0) //7
                    .slider("Minutes", 0, 59, 1, 0) //8
                    .slider("Seconds", 0, 59, 1, 0); //9
                form.show(p).then(async result => {
                    if (result.canceled === true) return;
                    const player = result.formValues[0];
                    const reason = result.formValues[1];
                    const isPermaJailed = result.formValues[2];
                    const jailedBy = p.name;

                    if (isPermaJailed === true) {
                        if (!isValidUsername(player)) {
                            await runTellraw(p, `§cError, the username you entered is invalid.`);
                            p.playSound("au.error");

                        } else if (reason.trim() === "") {
                            await runTellraw(p, `§cError, you must enter a reason.`);
                            p.playSound("au.error");

                        } else if (isBanned(player)) {
                            await runTellraw(p, `§cError, the specified player is currently banned.`);
                            p.playSound("au.error");

                        } else if (isAdmin(player)) {
                            await runTellraw(p, `§cError, the specified player is an admin, cannot jail.`);
                            p.playSound("au.error");

                        } else if (isOwner(player)) {
                            await runTellraw(p, `§cError, the specified player is the owner, cannot jail.`);
                            p.playSound("au.error");

                        } else if (isJailed(player)) {
                            await runTellraw(p, `§cError, the specified player is already in jail.`);
                            p.playSound("au.error");

                        } else if (!isJailLocSet()) {
                            await runTellraw(p, `§cError, the location of the jail has recently been removed by another user.`);
                            p.playSound("au.error");

                        } else {
                            try {
                                await runTellraw(p, '§bJailing...');

                                const playerRaw = world.getPlayers({ name: player })[0];
                                if (playerRaw) {
                                    try {
                                        playerRaw.runCommand("camera @s set au:tpanimation ease 5 in_sine pos ~ ~100 ~ rot 90 0");
                                        await delay(40);
                                        playerRaw.runCommand("camera @s fade time 3 1 1 color 0 0 0");
                                        await delay(60);
                                        playerRaw.teleport(getJailLoc()[0], getJailLoc()[1]);
                                        playerRaw.runCommand("camera @s clear");
                                        await delay(20);
                                        playerRaw.onScreenDisplay.setTitle('§l§cYou have been jailed', { fadeInDuration: 2 * TicksPerSecond, stayDuration: 1.5 * TicksPerSecond, fadeOutDuration: 2 * TicksPerSecond });
                                        runCmd(playerRaw, 'playsound random.anvil_land @s ~ ~ ~ 100 0.5');

                                        try {
                                            world.scoreboard.getObjective('-auTempUnjailed').removeParticipant('/' + player);
                                        } catch (e) { }
                                        await runCmd(overworld, `scoreboard players set "${player}-aureason${reason}-aujailedby${jailedBy}-autime-aupermajailed-au-auhasjoinedtrue" -auJailed 0`);
                                    } catch (e) {
                                        //Handles what happens if the player leaves while it's being jailed
                                        try {
                                            world.scoreboard.getObjective('-auTempUnjailed').removeParticipant('/' + player);
                                        } catch (e) { }
                                        await runCmd(overworld, `scoreboard players set "${player}-aureason${reason}-aujailedby${jailedBy}-autime-aupermajailed-au-auhasjoinedfalse" -auJailed 0`);
                                        await delay(20);
                                    }
                                } else {
                                    try {
                                        world.scoreboard.getObjective('-auTempUnjailed').removeParticipant('/' + player);
                                    } catch (e) { }
                                    await runCmd(overworld, `scoreboard players set "${player}-aureason${reason}-aujailedby${jailedBy}-autime-aupermajailed-au-auhasjoinedfalse" -auJailed 0`);
                                    await delay(20);
                                }

                                await runTellraw(p, `§aThe player §b${player}§a has been jailed successfully with reason: §c${reason}\n§7* §2Time: §3Permanently`);
                                p.playSound("au.success");
                            } catch (e) {
                                await runTellraw(p, `§cError, couldn't jail §4${player}§c.`);
                                p.playSound("au.error");
                            }
                        }
                    } else {
                        const jailYears = result.formValues[3];
                        const jailMonths = result.formValues[4];
                        const jailWeeks = result.formValues[5]; //Only to calculate the respective days and add them to jailDays
                        const jailDays = result.formValues[6]; //Specified days without taking the weeks into account, include this in the kick cmd
                        const jailTotalDays = jailDays + jailWeeks * 7;
                        const jailHours = result.formValues[7];
                        const jailMinutes = result.formValues[8];
                        const jailSeconds = result.formValues[9];

                        const releaseDate = moment();
                        releaseDate.add(jailYears, 'years');
                        releaseDate.add(jailMonths, 'months');
                        releaseDate.add(jailTotalDays, 'days');
                        releaseDate.add(jailHours, 'hours');
                        releaseDate.add(jailMinutes, 'minutes');
                        releaseDate.add(jailSeconds, 'seconds');

                        const releaseISO = releaseDate.toISOString(); //Date when you will get released

                        if (!isValidUsername(player)) {
                            await runTellraw(p, `§cError, the username you entered is invalid.`);
                            p.playSound("au.error");

                        } else if (reason.trim() === "") {
                            await runTellraw(p, `§cError, you must enter a reason.`);
                            p.playSound("au.error");

                        } else if (result.formValues.slice(3).every(value => value === 0)) {
                            await runTellraw(p, `§cError, you must specify a jail time.`);
                            p.playSound("au.error");

                        } else if (isBanned(player)) {
                            await runTellraw(p, `§cError, the specified player is currently banned.`);
                            p.playSound("au.error");

                        } else if (isAdmin(player)) {
                            await runTellraw(p, `§cError, the specified player is an admin, cannot jail.`);
                            p.playSound("au.error");

                        } else if (isOwner(player)) {
                            await runTellraw(p, `§cError, the specified player is the owner, cannot jail.`);
                            p.playSound("au.error");

                        } else if (isJailed(player)) {
                            await runTellraw(p, `§cError, the specified player is already in jail.`);
                            p.playSound("au.error");

                        } else if (!isJailLocSet()) {
                            await runTellraw(p, `§cError, the location of the jail has recently been removed by another user.`);
                            p.playSound("au.error");

                        } else {
                            try {
                                await runTellraw(p, '§bJailing...');

                                const years = jailYears === 0 ? "" : jailYears === 1 ? `${jailYears} year ` : `${jailYears} years `;
                                const months = jailMonths === 0 ? "" : jailMonths === 1 ? `${jailMonths} month ` : `${jailMonths} months `;
                                const weeks = jailWeeks === 0 ? "" : jailWeeks === 1 ? `${jailWeeks} week ` : `${jailWeeks} weeks `;
                                const days = jailDays === 0 ? "" : jailDays === 1 ? `${jailDays} day ` : `${jailDays} days `;
                                const hours = jailHours === 0 ? "" : jailHours === 1 ? `${jailHours} hour ` : `${jailHours} hours `;
                                const minutes = jailMinutes === 0 ? "" : jailMinutes === 1 ? `${jailMinutes} minute ` : `${jailMinutes} minutes `;
                                const seconds = jailSeconds === 0 ? "" : jailSeconds === 1 ? `${jailSeconds} second` : `${jailSeconds} seconds`;

                                const playerRaw = world.getPlayers({ name: player })[0];
                                if (playerRaw) {
                                    try {
                                        playerRaw.runCommand("camera @s set au:tpanimation ease 5 in_sine pos ~ ~100 ~ rot 90 0");
                                        await delay(40);
                                        playerRaw.runCommand("camera @s fade time 3 1 1 color 0 0 0");
                                        await delay(60);
                                        playerRaw.teleport(getJailLoc()[0], getJailLoc()[1]);
                                        playerRaw.runCommand("camera @s clear");
                                        await delay(20);
                                        playerRaw.onScreenDisplay.setTitle('§l§cYou have been jailed', { fadeInDuration: 2 * TicksPerSecond, stayDuration: 1.5 * TicksPerSecond, fadeOutDuration: 2 * TicksPerSecond });
                                        runCmd(playerRaw, 'playsound random.anvil_land @s ~ ~ ~ 100 0.5');

                                        try {
                                            world.scoreboard.getObjective('-auTempUnjailed').removeParticipant('/' + player);
                                        } catch (e) { }
                                        await runCmd(overworld, `scoreboard players set "${player}-aureason${reason}-aujailedby${jailedBy}-autime${releaseISO}-auhasjoinedtrue" -auJailed 0`);
                                    } catch (e) {
                                        //Handles what happens if the player leaves while it's being jailed
                                        try {
                                            world.scoreboard.getObjective('-auTempUnjailed').removeParticipant('/' + player);
                                        } catch (e) { }
                                        await runCmd(overworld, `scoreboard players set "${player}-aureason${reason}-aujailedby${jailedBy}-autime${releaseISO}-auhasjoinedfalse" -auJailed 0`);
                                        await delay(20);
                                    }
                                } else {
                                    try {
                                        world.scoreboard.getObjective('-auTempUnjailed').removeParticipant('/' + player);
                                    } catch (e) { }
                                    await runCmd(overworld, `scoreboard players set "${player}-aureason${reason}-aujailedby${jailedBy}-autime${releaseISO}-auhasjoinedfalse" -auJailed 0`);
                                    await delay(20);
                                }

                                await runTellraw(p, `§aThe player §b${player}§a has been jailed successfully with reason: §c${reason}\n§7* §2Time: §3${years}${months}${weeks}${days}${hours}${minutes}${seconds}`);
                                p.playSound("au.success");
                            } catch (e) {
                                await runTellraw(p, `§cError, couldn't jail §4${player}§c.`);
                                p.playSound("au.error");
                            }
                        }
                    }
                });
            } else if (response.selection >= 2) {
                const selectedPlayer = availablePlayers[response.selection - 2];
                if (isJailed(selectedPlayer)) {
                    await runTellraw(p, `§cError, the selected player has recently been jailed by another user.`);
                    p.playSound("au.error");

                } else {
                    const form = new ModalFormData()
                        .title(`Jail §b${selectedPlayer}`)
                        .textField("Enter a reason:", "Reason") //0
                        .toggle("Permanent jail", false) //1
                        .slider("Years", 0, 10, 1, 0) //2
                        .slider("Months", 0, 11, 1, 0) //3
                        .slider("Weeks", 0, 3, 1, 0) //4
                        .slider("Days", 0, 6, 1, 0) //5
                        .slider("Hours", 0, 23, 1, 0) //6
                        .slider("Minutes", 0, 59, 1, 0) //7
                        .slider("Seconds", 0, 59, 1, 0); //8
                    form.show(p).then(async result => {
                        if (result.canceled === true) return;
                        const reason = result.formValues[0];
                        const isPermaJailed = result.formValues[1];
                        const jailedBy = p.name;

                        if (isPermaJailed === true) {
                            if (reason.trim() === "") {
                                await runTellraw(p, `§cError, you must enter a reason.`);
                                p.playSound("au.error");

                            } else if (isBanned(selectedPlayer)) {
                                await runTellraw(p, `§cError, the selected player has recently been banned by another user.`);
                                p.playSound("au.error");

                            } else if (isAdmin(selectedPlayer)) {
                                await runTellraw(p, `§cError, the selected player has recently been set as an admin, cannot jail.`);
                                p.playSound("au.error");

                            } else if (isOwner(selectedPlayer)) {
                                await runTellraw(p, `§cError, the selected player has recently been set as the owner, cannot jail.`);
                                p.playSound("au.error");

                            } else if (isJailed(selectedPlayer)) {
                                await runTellraw(p, `§cError, the selected player has recently been jailed by another user.`);
                                p.playSound("au.error");

                            } else if (!isJailLocSet()) {
                                await runTellraw(p, `§cError, the location of the jail has recently been removed by another user.`);
                                p.playSound("au.error");

                            } else {
                                try {
                                    await runTellraw(p, '§bJailing...');

                                    const playerRaw = world.getPlayers({ name: selectedPlayer })[0];
                                    if (playerRaw) {
                                        try {
                                            playerRaw.runCommand("camera @s set au:tpanimation ease 5 in_sine pos ~ ~100 ~ rot 90 0");
                                            await delay(40);
                                            playerRaw.runCommand("camera @s fade time 3 1 1 color 0 0 0");
                                            await delay(60);
                                            playerRaw.teleport(getJailLoc()[0], getJailLoc()[1]);
                                            playerRaw.runCommand("camera @s clear");
                                            await delay(20);
                                            playerRaw.onScreenDisplay.setTitle('§l§cYou have been jailed', { fadeInDuration: 2 * TicksPerSecond, stayDuration: 1.5 * TicksPerSecond, fadeOutDuration: 2 * TicksPerSecond });
                                            runCmd(playerRaw, 'playsound random.anvil_land @s ~ ~ ~ 100 0.5');

                                            try {
                                                world.scoreboard.getObjective('-auTempUnjailed').removeParticipant('/' + selectedPlayer);
                                            } catch (e) { }
                                            await runCmd(overworld, `scoreboard players set "${selectedPlayer}-aureason${reason}-aujailedby${jailedBy}-autime-aupermajailed-au-auhasjoinedtrue" -auJailed 0`);
                                        } catch (e) {
                                            //Handles what happens if the player leaves while it's being jailed
                                            try {
                                                world.scoreboard.getObjective('-auTempUnjailed').removeParticipant('/' + selectedPlayer);
                                            } catch (e) { }
                                            await runCmd(overworld, `scoreboard players set "${selectedPlayer}-aureason${reason}-aujailedby${jailedBy}-autime-aupermajailed-au-auhasjoinedfalse" -auJailed 0`);
                                            await delay(20);
                                        }
                                    } else {
                                        try {
                                            world.scoreboard.getObjective('-auTempUnjailed').removeParticipant('/' + selectedPlayer);
                                        } catch (e) { }
                                        await runCmd(overworld, `scoreboard players set "${selectedPlayer}-aureason${reason}-aujailedby${jailedBy}-autime-aupermajailed-au-auhasjoinedfalse" -auJailed 0`);
                                        await delay(20);
                                    }

                                    await runTellraw(p, `§aThe player §b${selectedPlayer}§a has been jailed successfully with reason: §c${reason}\n§7* §2Time: §3Permanently`);
                                    p.playSound("au.success");
                                } catch (e) {
                                    await runTellraw(p, `§cError, couldn't jail §4${selectedPlayer}§c.`);
                                    p.playSound("au.error");
                                }
                            }
                        } else {
                            const jailYears = result.formValues[2];
                            const jailMonths = result.formValues[3];
                            const jailWeeks = result.formValues[4]; //Only to calculate the respective days and add them to jailDays
                            const jailDays = result.formValues[5]; //Specified days without taking the weeks into account, include this in the kick cmd
                            const jailTotalDays = jailDays + jailWeeks * 7;
                            const jailHours = result.formValues[6];
                            const jailMinutes = result.formValues[7];
                            const jailSeconds = result.formValues[8];

                            const releaseDate = moment();
                            releaseDate.add(jailYears, 'years');
                            releaseDate.add(jailMonths, 'months');
                            releaseDate.add(jailTotalDays, 'days');
                            releaseDate.add(jailHours, 'hours');
                            releaseDate.add(jailMinutes, 'minutes');
                            releaseDate.add(jailSeconds, 'seconds');

                            const releaseISO = releaseDate.toISOString(); //Date when you will get released

                            if (reason.trim() === "") {
                                await runTellraw(p, `§cError, you must enter a reason.`);
                                p.playSound("au.error");

                            } else if (result.formValues.slice(3).every(value => value === 0)) {
                                await runTellraw(p, `§cError, you must specify a jail time.`);

                            } else if (isBanned(selectedPlayer)) {
                                await runTellraw(p, `§cError, the selected player has recently been banned by another user.`);
                                p.playSound("au.error");

                            } else if (isAdmin(selectedPlayer)) {
                                await runTellraw(p, `§cError, the selected player has recently been set as an admin, cannot jail.`);
                                p.playSound("au.error");

                            } else if (isOwner(selectedPlayer)) {
                                await runTellraw(p, `§cError, the selected player has recently been set as the owner, cannot jail.`);
                                p.playSound("au.error");

                            } else if (isJailed(selectedPlayer)) {
                                await runTellraw(p, `§cError, the selected player has recently been jailed by another user.`);
                                p.playSound("au.error");

                            } else if (!isJailLocSet()) {
                                await runTellraw(p, `§cError, the location of the jail has recently been removed by another user.`);
                                p.playSound("au.error");

                            } else {
                                try {
                                    await runTellraw(p, '§bJailing...');

                                    const years = jailYears === 0 ? "" : jailYears === 1 ? `${jailYears} year ` : `${jailYears} years `;
                                    const months = jailMonths === 0 ? "" : jailMonths === 1 ? `${jailMonths} month ` : `${jailMonths} months `;
                                    const weeks = jailWeeks === 0 ? "" : jailWeeks === 1 ? `${jailWeeks} week ` : `${jailWeeks} weeks `;
                                    const days = jailDays === 0 ? "" : jailDays === 1 ? `${jailDays} day ` : `${jailDays} days `;
                                    const hours = jailHours === 0 ? "" : jailHours === 1 ? `${jailHours} hour ` : `${jailHours} hours `;
                                    const minutes = jailMinutes === 0 ? "" : jailMinutes === 1 ? `${jailMinutes} minute ` : `${jailMinutes} minutes `;
                                    const seconds = jailSeconds === 0 ? "" : jailSeconds === 1 ? `${jailSeconds} second` : `${jailSeconds} seconds`;

                                    const playerRaw = world.getPlayers({ name: selectedPlayer })[0];
                                    if (playerRaw) {
                                        try {
                                            playerRaw.runCommand("camera @s set au:tpanimation ease 5 in_sine pos ~ ~100 ~ rot 90 0");
                                            await delay(40);
                                            playerRaw.runCommand("camera @s fade time 3 1 1 color 0 0 0");
                                            await delay(60);
                                            playerRaw.teleport(getJailLoc()[0], getJailLoc()[1]);
                                            playerRaw.runCommand("camera @s clear");
                                            await delay(20);
                                            playerRaw.onScreenDisplay.setTitle('§l§cYou have been jailed', { fadeInDuration: 2 * TicksPerSecond, stayDuration: 1.5 * TicksPerSecond, fadeOutDuration: 2 * TicksPerSecond });
                                            runCmd(playerRaw, 'playsound random.anvil_land @s ~ ~ ~ 100 0.5');

                                            try {
                                                world.scoreboard.getObjective('-auTempUnjailed').removeParticipant('/' + selectedPlayer);
                                            } catch (e) { }
                                            await runCmd(overworld, `scoreboard players set "${selectedPlayer}-aureason${reason}-aujailedby${jailedBy}-autime${releaseISO}-auhasjoinedtrue" -auJailed 0`);
                                        } catch (e) {
                                            //Handles what happens if the player leaves while it's being jailed
                                            try {
                                                world.scoreboard.getObjective('-auTempUnjailed').removeParticipant('/' + selectedPlayer);
                                            } catch (e) { }
                                            await runCmd(overworld, `scoreboard players set "${selectedPlayer}-aureason${reason}-aujailedby${jailedBy}-autime${releaseISO}-auhasjoinedfalse" -auJailed 0`);
                                            await delay(20);
                                        }
                                    } else {
                                        try {
                                            world.scoreboard.getObjective('-auTempUnjailed').removeParticipant('/' + selectedPlayer);
                                        } catch (e) { }
                                        await runCmd(overworld, `scoreboard players set "${selectedPlayer}-aureason${reason}-aujailedby${jailedBy}-autime${releaseISO}-auhasjoinedfalse" -auJailed 0`);
                                        await delay(20);
                                    }

                                    await runTellraw(p, `§aThe player §b${selectedPlayer}§a has been jailed successfully with reason: §c${reason}\n§7* §2Time: §3${years}${months}${weeks}${days}${hours}${minutes}${seconds}`);
                                    p.playSound("au.success");
                                } catch (e) {
                                    await runTellraw(p, `§cError, couldn't jail §4${selectedPlayer}§c.`);
                                    p.playSound("au.error");
                                }
                            }
                        }
                    });
                }
            }
        });
    }
}

function releasePlayer(p) {
    if (!isJailExitLocSet()) {
        const form = new MessageFormData()
            .title("Release a player")
            .body("You haven't set the §ljail exit location§r yet.\n§cJailed players won't able to leave until a location is set.\n§r§lWould you like to set it up now?§r")
            .button1("No")
            .button2("Yes");
        form.show(p).then(result => {
            if (result.selection === 0) {
                jailMenu(p);
            } else if (result.selection === 1) {
                jailExitLocConfig(p);
            }
        });
    } else {
        const form = new ActionFormData()
            .title("Release a player")
            .body("Select an offline/online jailed player to release")
            .button("§l<-- Back", "textures/icons/back.png")
            .button("Type an offline/online player instead", "textures/icons/pencil.png");
        const jailedPlayers = getJailedPlayers();
        for (const player of jailedPlayers) {
            form.button(player, "textures/icons/steve_icon.png");
        }

        form.show(p).then((response) => {
            if (response.canceled === true) return;
            if (response.selection === 0) {
                jailMenu(p);
            } else if (response.selection === 1) {
                const form = new ModalFormData()
                    .title("Release a player")
                    .textField("Type below the player you would like to release.", "Player's name");
                form.show(p).then(async result => {
                    if (result.canceled === true) return;
                    const player = result.formValues[0];

                    if (!isValidUsername(player)) {
                        await runTellraw(p, `§cError, the username you entered is invalid.`);
                        p.playSound("au.error");

                    } else if (!isJailed(player)) {
                        await runTellraw(p, `§cError, specified player is not in jail.`);
                        p.playSound("au.error");

                    } else if (!isJailExitLocSet()) {
                        await runTellraw(p, `§cError, the jail exit location has recently been removed by another user.`);
                        p.playSound("au.error");

                    } else {
                        try {
                            await runTellraw(p, '§bReleasing...');

                            const reason = getJailReason(player);
                            const jailedBy = getJailedBy(player);
                            const releaseISO = getReleaseISO(player);
                            const playerRaw = world.getPlayers({ name: player })[0];

                            if (playerRaw) {
                                try {
                                    if (getReleaseMillisecondsLeft(player) > 3200 || isPermaJailed(player)) {
                                        playerRaw.runCommand("camera @s fade time 3 1 1 color 0 0 0");
                                        await delay(60);
                                        playerRaw.teleport(getJailExitLoc()[0], getJailExitLoc()[1]);
                                        playerRaw.runCommand('gamemode survival');
                                        world.scoreboard.getObjective('-auJailed').removeParticipant(`${player}-aureason${reason}-aujailedby${jailedBy}-autime${releaseISO}-auhasjoined${hasJailedPlJoined(player)}`);
                                        await delay(20);
                                        playerRaw.onScreenDisplay.setTitle('§l§bYou have been released', { fadeInDuration: 2 * TicksPerSecond, stayDuration: 1.5 * TicksPerSecond, fadeOutDuration: 2 * TicksPerSecond });
                                        runCmd(playerRaw, "playsound beacon.activate @s ~ ~ ~ 100");
                                    } else {
                                        await delay(62);
                                    }
                                } catch (e) {
                                    //Handles what happens if the player leaves while it's being released
                                    world.scoreboard.getObjective('-auJailed').removeParticipant(`${player}-aureason${reason}-aujailedby${jailedBy}-autime${releaseISO}-auhasjoined${hasJailedPlJoined(player)}`);
                                    world.scoreboard.getObjective('-auTempUnjailed').setScore('/' + player, 0);
                                    await delay(20);
                                }
                            } else {
                                world.scoreboard.getObjective('-auJailed').removeParticipant(`${player}-aureason${reason}-aujailedby${jailedBy}-autime${releaseISO}-auhasjoined${hasJailedPlJoined(player)}`);
                                world.scoreboard.getObjective('-auTempUnjailed').setScore('/' + player, 0);
                                await delay(20);
                            }

                            await runTellraw(p, `§aThe player §b${player}§a has been released successfully.`);
                            p.playSound("au.success");
                        } catch (e) {
                            await runTellraw(p, `§cError, couldn't release §4${player}§c, perhaps the jail time is now over.`);
                            p.playSound("au.error");
                        }
                    }
                });
            } else if (response.selection >= 2) {
                const selectedPlayer = jailedPlayers[response.selection - 2];

                const form = new MessageFormData()
                    .title("Release a player")
                    .body(`Are you sure you want to release §b${selectedPlayer}§r?`)
                    .button1("No")
                    .button2("Yes");
                form.show(p).then(async result => {
                    if (result.selection === 0) {
                        releasePlayer(p);
                    } else if (result.selection === 1) {
                        if (!isJailed(selectedPlayer)) {
                            await runTellraw(p, `§cError, the selected player has recently been released by another user.`);
                            p.playSound("au.error");

                        } else if (!isJailExitLocSet()) {
                            await runTellraw(p, `§cError, the jail exit location has recently been removed by another user.`);
                            p.playSound("au.error");

                        } else {
                            try {
                                await runTellraw(p, '§bReleasing...');

                                const reason = getJailReason(selectedPlayer);
                                const jailedBy = getJailedBy(selectedPlayer);
                                const releaseISO = getReleaseISO(selectedPlayer);
                                const playerRaw = world.getPlayers({ name: selectedPlayer })[0];

                                if (playerRaw) {
                                    try {
                                        if (getReleaseMillisecondsLeft(selectedPlayer) > 3200 || isPermaJailed(selectedPlayer)) {
                                            playerRaw.runCommand("camera @s fade time 3 1 1 color 0 0 0");
                                            await delay(60);
                                            playerRaw.teleport(getJailExitLoc()[0], getJailExitLoc()[1]);
                                            playerRaw.runCommand('gamemode survival');
                                            world.scoreboard.getObjective('-auJailed').removeParticipant(`${selectedPlayer}-aureason${reason}-aujailedby${jailedBy}-autime${releaseISO}-auhasjoined${hasJailedPlJoined(selectedPlayer)}`);
                                            await delay(20);
                                            playerRaw.onScreenDisplay.setTitle('§l§bYou have been released', { fadeInDuration: 2 * TicksPerSecond, stayDuration: 1.5 * TicksPerSecond, fadeOutDuration: 2 * TicksPerSecond });
                                            runCmd(playerRaw, "playsound beacon.activate @s ~ ~ ~ 100");
                                        } else {
                                            await delay(62);
                                        }
                                    } catch (e) {
                                        //Handles what happens if the player leaves while it's being released
                                        world.scoreboard.getObjective('-auJailed').removeParticipant(`${selectedPlayer}-aureason${reason}-aujailedby${jailedBy}-autime${releaseISO}-auhasjoined${hasJailedPlJoined(selectedPlayer)}`);
                                        world.scoreboard.getObjective('-auTempUnjailed').setScore('/' + selectedPlayer, 0);
                                        await delay(20);
                                    }
                                } else {
                                    world.scoreboard.getObjective('-auJailed').removeParticipant(`${selectedPlayer}-aureason${reason}-aujailedby${jailedBy}-autime${releaseISO}-auhasjoined${hasJailedPlJoined(selectedPlayer)}`);
                                    world.scoreboard.getObjective('-auTempUnjailed').setScore('/' + selectedPlayer, 0);
                                    await delay(20);
                                }
                                await runTellraw(p, `§aThe player §b${selectedPlayer}§a has been released successfully.`);
                                p.playSound("au.success");
                            } catch (e) {
                                await runTellraw(p, `§cError, couldn't release §4${selectedPlayer}§c, perhaps the jail time is now over.`);
                                p.playSound("au.error");
                            }
                        }
                    }
                });
            }
        });
    }
}

function jailLocConfig(p) {
    const form = new ActionFormData()
        .title("Jail location config")
        .button("§l<-- Back", "textures/icons/back.png"); //0
    if (!isJailLocSet()) {
        form.body("You haven't set the location of the jail yet, please select an option. You can go to any dimension.")
            .button("Set jail location to current location", "textures/icons/tick.png"); //1
    } else {
        const _jailDim = getJailLoc()[1].dimension.id;
        let jailDim = '';
        if (_jailDim === "minecraft:overworld") {
            jailDim = '§bOverworld';
        } else if (_jailDim === "minecraft:nether") {
            jailDim = '§cNether';
        } else if (_jailDim === "minecraft:the_end") {
            jailDim = '§5The End';
        }

        form.body(`The location of the jail has already been set at §a${round(getJailLoc()[0].x)} ${round(getJailLoc()[0].y)} ${round(getJailLoc()[0].z)}§r, ${jailDim}§r. Select an option.`)
            .button("Teleport to jail location", "textures/icons/teleport.png") //1
            .button("Set jail location to current location", "textures/icons/tick.png") //2
            .button("Remove jail location", "textures/icons/delete.png"); //3
    }
    form.show(p).then((response) => {
        if (response.canceled) return;

        const { selection } = response;
        if (selection === 0) { //0
            jailMenu(p);
        } else if (!isJailLocSet()) {
            if (selection === 1) { //1
                const _playerDim = p.dimension.id;
                let playerDim = '';
                if (_playerDim === "minecraft:overworld") {
                    playerDim = '§bOverworld';
                } else if (_playerDim === "minecraft:nether") {
                    playerDim = '§cNether';
                } else if (_playerDim === "minecraft:the_end") {
                    playerDim = '§5The End';
                }
                const currentLoc = p.location;

                const form = new MessageFormData()
                    .title("Jail location config")
                    .body(`Are you sure you want to set the location of the jail to §a${round(currentLoc.x)} ${round(currentLoc.y)} ${round(currentLoc.z)}§r, ${playerDim}§r?`)
                    .button1("No")
                    .button2("Yes");
                form.show(p).then(async result => {
                    if (result.selection === 0) {
                        jailLocConfig(p);
                    } else if (result.selection === 1) {
                        if (!isJailLocSet()) {
                            try {
                                await runCmd(p, `scoreboard players set "-au${p.dimension.id.replace(/minecraft:/, '')} -au${currentLoc.x} -au${currentLoc.y} -au${currentLoc.z}" -auJailLoc 0`);
                                await runTellraw(p, `§aThe jail location has been successfully set to §b${round(currentLoc.x)} ${round(currentLoc.y)} ${round(currentLoc.z)}§a, ${playerDim}§a.`);
                                p.playSound("au.success");
                            } catch (e) {
                                await runTellraw(p, `§cError, couldn't set the jail location.`);
                                p.playSound("au.error");
                            }
                        } else {
                            await runTellraw(p, `§cError, the jail location has recently been set by another user.`);
                            p.playSound("au.error");
                        }
                    }
                });
            }
        } else {
            if (selection === 1) { //1
                const _jailDim = getJailLoc()[1].dimension.id;
                let jailDim = '';
                if (_jailDim === "minecraft:overworld") {
                    jailDim = '§bOverworld';
                } else if (_jailDim === "minecraft:nether") {
                    jailDim = '§cNether';
                } else if (_jailDim === "minecraft:the_end") {
                    jailDim = '§5The End';
                }

                const form = new MessageFormData()
                    .title("Jail location config")
                    .body(`Are you sure you want to teleport to §a${round(getJailLoc()[0].x)} ${round(getJailLoc()[0].y)} ${round(getJailLoc()[0].z)}§r, ${jailDim}§r?`)
                    .button1("No")
                    .button2("Yes");
                form.show(p).then(async result => {
                    if (result.selection === 0) {
                        jailLocConfig(p);
                    } else if (result.selection === 1) {
                        try {
                            if (isJailLocSet()) {
                                await runTellraw(p, `§bTeleporting...`);
                                p.runCommand("camera @s set au:tpanimation ease 4 in_sine pos ~ ~100 ~ rot 90 0");
                                await delay(20);
                                p.runCommand("camera @s fade time 3 1 1 color 0 0 0");
                                await delay(60);
                                p.teleport(getJailLoc()[0], getJailLoc()[1]);
                                p.runCommand("camera @s clear");
                                await delay(20);
                                await runCmd(p, "playsound beacon.activate @s ~ ~ ~ 100");
                                await runTellraw(p, `§bTeleported!`);
                            } else {
                                await runTellraw(p, `§cError, the jail location has recently been removed by another user.`);
                                p.playSound("au.error");
                            }
                        } catch (e) {
                            await runTellraw(p, `§cError, couldn't teleport you to the jail location.`);
                            p.playSound("au.error");
                        }
                    }
                });
            } else if (selection === 2) { //2
                const _playerDim = p.dimension.id;
                let playerDim = '';
                if (_playerDim === "minecraft:overworld") {
                    playerDim = '§bOverworld';
                } else if (_playerDim === "minecraft:nether") {
                    playerDim = '§cNether';
                } else if (_playerDim === "minecraft:the_end") {
                    playerDim = '§5The End';
                }
                const currentLoc = p.location;

                const form = new MessageFormData()
                    .title("Jail location config")
                    .body(`Are you sure you want to set the location of the jail to §a${round(currentLoc.x)} ${round(currentLoc.y)} ${round(currentLoc.z)}§r, ${playerDim}§r?\n§cThis will override the previous location.`)
                    .button1("No")
                    .button2("Yes");
                form.show(p).then(async result => {
                    if (result.selection === 0) {
                        jailLocConfig(p);
                    } else if (result.selection === 1) {
                        try {
                            const scoreboard = world.scoreboard.getObjective('-auJailLoc').getParticipants()[0]?.displayName;
                            if (!scoreboard) { //Prevents an error in case another player already removed the jail location
                                await runCmd(p, `scoreboard players set "-au${p.dimension.id.replace(/minecraft:/, '')} -au${currentLoc.x} -au${currentLoc.y} -au${currentLoc.z}" -auJailLoc 0`);
                                await runTellraw(p, `§aThe jail location has been successfully set to §b${round(currentLoc.x)} ${round(currentLoc.y)} ${round(currentLoc.z)}§a, ${playerDim}§a.`);
                                p.playSound("au.success");
                            } else {
                                await runCmd(p, `scoreboard players reset "${scoreboard}" -auJailLoc`);
                                await runCmd(p, `scoreboard players set "-au${p.dimension.id.replace(/minecraft:/, '')} -au${currentLoc.x} -au${currentLoc.y} -au${currentLoc.z}" -auJailLoc 0`);
                                await runTellraw(p, `§aThe jail location has been successfully set to §b${round(currentLoc.x)} ${round(currentLoc.y)} ${round(currentLoc.z)}§a, ${playerDim}§a.`);
                                p.playSound("au.success");
                            }
                        } catch (e) {
                            await runTellraw(p, `§cError, couldn't set the jail location.`);
                            p.playSound("au.error");
                        }
                    }
                });
            } else if (selection === 3) { //3
                const _jailDim = getJailLoc()[1].dimension.id;
                let jailDim = '';
                if (_jailDim === "minecraft:overworld") {
                    jailDim = '§bOverworld';
                } else if (_jailDim === "minecraft:nether") {
                    jailDim = '§cNether';
                } else if (_jailDim === "minecraft:the_end") {
                    jailDim = '§5The End';
                }

                const form = new MessageFormData()
                    .title("Jail location config")
                    .body(`Are you sure you want to remove the current jail location (§a${round(getJailLoc()[0].x)} ${round(getJailLoc()[0].y)} ${round(getJailLoc()[0].z)}§r, ${jailDim}§r)?\n§cYou won't be able to jail more players until a new location is set.`)
                    .button1("No")
                    .button2("Yes");
                form.show(p).then(async result => {
                    if (result.selection === 0) {
                        jailLocConfig(p);
                    } else if (result.selection === 1) {
                        try {
                            const scoreboard = world.scoreboard.getObjective('-auJailLoc').getParticipants()[0]?.displayName;
                            if (scoreboard) {
                                await runCmd(p, `scoreboard players reset "${scoreboard}" -auJailLoc`);
                                await runTellraw(p, `§aThe §bjail location§a has been removed successfully.`);
                                p.playSound("au.success");
                            } else {
                                await runTellraw(p, `§cError, the jail location has recently been removed by another user.`);
                                p.playSound("au.error");
                            }
                        } catch (e) {
                            await runTellraw(p, `§cError, couldn't remove the jail location.`);
                            p.playSound("au.error");
                        }
                    }
                });
            }
        }
    });
}

function jailExitLocConfig(p) {
    const form = new ActionFormData()
        .title("Jail exit location config")
        .button("§l<-- Back", "textures/icons/back.png"); //0
    if (!isJailExitLocSet()) {
        form.body("You haven't set the exit location of the jail yet, please select an option. You can go to any dimension.")
            .button("Set jail exit location to current location", "textures/icons/tick.png"); //1
    } else {
        const _exitDim = getJailExitLoc()[1].dimension.id;
        let exitDim = '';
        if (_exitDim === "minecraft:overworld") {
            exitDim = '§bOverworld';
        } else if (_exitDim === "minecraft:nether") {
            exitDim = '§cNether';
        } else if (_exitDim === "minecraft:the_end") {
            exitDim = '§5The End';
        }

        form.body(`The exit location of the jail has already been set at §a${round(getJailExitLoc()[0].x)} ${round(getJailExitLoc()[0].y)} ${round(getJailExitLoc()[0].z)}§r, ${exitDim}§r. Select an option.`)
            .button("Teleport to jail exit location", "textures/icons/teleport.png") //1
            .button("Set jail exit location to current location", "textures/icons/tick.png") //2
            .button("Remove jail exit location", "textures/icons/delete.png"); //3
    }
    form.show(p).then((response) => {
        if (response.canceled) return;

        const { selection } = response;
        if (selection === 0) { //0
            jailMenu(p);
        } else if (!isJailExitLocSet()) {
            if (selection === 1) { //1
                const _playerDim = p.dimension.id;
                let playerDim = '';
                if (_playerDim === "minecraft:overworld") {
                    playerDim = '§bOverworld';
                } else if (_playerDim === "minecraft:nether") {
                    playerDim = '§cNether';
                } else if (_playerDim === "minecraft:the_end") {
                    playerDim = '§5The End';
                }
                const currentLoc = p.location;

                const form = new MessageFormData()
                    .title("Jail exit location config")
                    .body(`Are you sure you want to set the exit location of the jail to §a${round(currentLoc.x)} ${round(currentLoc.y)} ${round(currentLoc.z)}§r, ${playerDim}§r?`)
                    .button1("No")
                    .button2("Yes");
                form.show(p).then(async result => {
                    if (result.selection === 0) {
                        jailExitLocConfig(p);
                    } else if (result.selection === 1) {
                        if (!isJailExitLocSet()) {
                            try {
                                await runCmd(p, `scoreboard players set "-au${p.dimension.id.replace(/minecraft:/, '')} -au${currentLoc.x} -au${currentLoc.y} -au${currentLoc.z}" -auJailExitLoc 0`);
                                await runTellraw(p, `§aThe jail exit location has been successfully set to §b${round(currentLoc.x)} ${round(currentLoc.y)} ${round(currentLoc.z)}§a, ${playerDim}§a.`);
                                p.playSound("au.success");
                            } catch (e) {
                                await runTellraw(p, `§cError, couldn't set the jail exit location.`);
                                p.playSound("au.error");
                            }
                        } else {
                            await runTellraw(p, `§cError, the jail exit location has recently been set by another user.`);
                            p.playSound("au.error");
                        }
                    }
                });
            }
        } else {
            if (selection === 1) { //1
                const _exitDim = getJailExitLoc()[1].dimension.id;
                let exitDim = '';
                if (_exitDim === "minecraft:overworld") {
                    exitDim = '§bOverworld';
                } else if (_exitDim === "minecraft:nether") {
                    exitDim = '§cNether';
                } else if (_exitDim === "minecraft:the_end") {
                    exitDim = '§5The End';
                }

                const form = new MessageFormData()
                    .title("Jail exit location config")
                    .body(`Are you sure you want to teleport to §a${round(getJailExitLoc()[0].x)} ${round(getJailExitLoc()[0].y)} ${round(getJailExitLoc()[0].z)}§r, ${exitDim}§r?`)
                    .button1("No")
                    .button2("Yes");
                form.show(p).then(async result => {
                    if (result.selection === 0) {
                        jailExitLocConfig(p);
                    } else if (result.selection === 1) {
                        try {
                            await runTellraw(p, `§bTeleporting...`);
                            p.runCommand("camera @s set au:tpanimation ease 4 in_sine pos ~ ~100 ~ rot 90 0");
                            await delay(20);
                            p.runCommand("camera @s fade time 3 1 1 color 0 0 0");
                            await delay(60);
                            p.teleport(getJailExitLoc()[0], getJailExitLoc()[1]);
                            p.runCommand("camera @s clear");
                            await delay(20);
                            await runCmd(p, "playsound beacon.activate @s ~ ~ ~ 100");
                            await runTellraw(p, `§bTeleported!`);
                        } catch (e) {
                            await runTellraw(p, `§cError, couldn't teleport you to the jail exit location.`);
                            p.playSound("au.error");
                        }
                    }
                });
            } else if (selection === 2) { //2
                const _playerDim = p.dimension.id;
                let playerDim = '';
                if (_playerDim === "minecraft:overworld") {
                    playerDim = '§bOverworld';
                } else if (_playerDim === "minecraft:nether") {
                    playerDim = '§cNether';
                } else if (_playerDim === "minecraft:the_end") {
                    playerDim = '§5The End';
                }
                const currentLoc = p.location;

                const form = new MessageFormData()
                    .title("Jail exit location config")
                    .body(`Are you sure you want to set the exit location of the jail to §a${round(currentLoc.x)} ${round(currentLoc.y)} ${round(currentLoc.z)}§r, ${playerDim}§r?\n§cThis will override the previous location.`)
                    .button1("No")
                    .button2("Yes");
                form.show(p).then(async result => {
                    if (result.selection === 0) {
                        jailExitLocConfig(p);
                    } else if (result.selection === 1) {
                        try {
                            const scoreboard = world.scoreboard.getObjective('-auJailExitLoc').getParticipants()[0]?.displayName;
                            if (!scoreboard) {
                                await runCmd(p, `scoreboard players set "-au${p.dimension.id.replace(/minecraft:/, '')} -au${currentLoc.x} -au${currentLoc.y} -au${currentLoc.z}" -auJailExitLoc 0`);
                                await runTellraw(p, `§aThe jail exit location has been successfully set to §b${round(currentLoc.x)} ${round(currentLoc.y)} ${round(currentLoc.z)}§a, ${playerDim}§a.`);
                                p.playSound("au.success");
                            } else {
                                await runCmd(p, `scoreboard players reset "${scoreboard}" -auJailExitLoc`);
                                await runCmd(p, `scoreboard players set "-au${p.dimension.id.replace(/minecraft:/, '')} -au${currentLoc.x} -au${currentLoc.y} -au${currentLoc.z}" -auJailExitLoc 0`);
                                await runTellraw(p, `§aThe jail exit location has been successfully set to §b${round(currentLoc.x)} ${round(currentLoc.y)} ${round(currentLoc.z)}§a, ${playerDim}§a.`);
                                p.playSound("au.success");
                            }
                        } catch (e) {
                            await runTellraw(p, `§cError, couldn't set the jail exit location.`);
                            p.playSound("au.error");
                        }
                    }
                });
            } else if (selection === 3) { //3
                const _exitDim = getJailExitLoc()[1].dimension.id;
                let exitDim = '';
                if (_exitDim === "minecraft:overworld") {
                    exitDim = '§bOverworld';
                } else if (_exitDim === "minecraft:nether") {
                    exitDim = '§cNether';
                } else if (_exitDim === "minecraft:the_end") {
                    exitDim = '§5The End';
                }

                const form = new MessageFormData()
                    .title("Jail exit location config")
                    .body(`§4WARNING§c, jailed players won't be able to leave the jail until a new exit location is set.\n§r Are you sure you want to remove the current jail exit location (§a${round(getJailExitLoc()[0].x)} ${round(getJailExitLoc()[0].y)} ${round(getJailExitLoc()[0].z)}§r, ${exitDim}§r)?`)
                    .button1("No")
                    .button2("Yes");
                form.show(p).then(async result => {
                    if (result.selection === 0) {
                        jailExitLocConfig(p);
                    } else if (result.selection === 1) {
                        try {
                            const scoreboard = world.scoreboard.getObjective('-auJailExitLoc').getParticipants()[0]?.displayName;
                            if (scoreboard) {
                                await runCmd(p, `scoreboard players reset "${scoreboard}" -auJailExitLoc`);
                                await runTellraw(p, `§aThe §bjail exit location§a has been removed successfully.`);
                                p.playSound("au.success");
                            } else {
                                await runTellraw(p, `§cError, the jail exit location has recently been removed by another user.`);
                                p.playSound("au.error");
                            }
                        } catch (e) {
                            await runTellraw(p, `§cError, couldn't remove the jail exit location.`);
                            p.playSound("au.error");
                        }
                    }
                });
            }
        }
    });
}

function projectilePowers(p) {
    const form = new ActionFormData()
        .title("Projectile powers")
        .body("Select an option")
        .button("§l<-- Back", "textures/icons/back.png")
        .button("Snowball powers", "textures/icons/snowball.png")
        .button("Arrow powers", "textures/icons/arrow.png")
        .button("Egg powers", "textures/icons/egg.png");
    form.show(p).then((response) => {
        if (response.canceled === true) return;
        const { selection } = response;

        if (selection === 0) {
            adminUtils(p);

        } else if (selection >= 1) {
            const playersArray = players.map(pname => pname.name);
            const projectiles = ["snowball", "arrow", "egg"];
            const selectedProj = projectiles[response.selection - 1];
            const form = new ActionFormData()
                .title("Toggle for a player")
                .body("Select an online player to enable/disable certain powers when throwing a snowball at an entity.\nYou will be able to select those powers later.")
                .button("§l<-- Back", "textures/icons/back.png")
                .button("Type an offline/online player instead", "textures/icons/pencil.png");
            for (const player of playersArray) {
                form.button(player, "textures/icons/steve_icon.png");
            }

            form.show(p).then((response) => {
                if (response.canceled === true) return;
                const { selection } = response;
                if (selection === 0) {
                    projectilePowers(p);

                } else if (selection === 1) {
                    const form = new ModalFormData()
                        .title("Toggle for a player")
                        .textField("Type below the player you would like to enable/disable the powers.", "Player's name");
                    form.show(p).then(async result => {
                        if (result.canceled === true) return;
                        const player = result.formValues[0];

                        if (!isValidUsername(player)) {
                            await runTellraw(p, "§cError, the username you entered is invalid.");
                            p.playSound("au.error");

                        } else {
                            const bolt = isPowerEnabled(player, selectedProj, "bolt");
                            const freeze = isPowerEnabled(player, selectedProj, "freeze");
                            const tnt = isPowerEnabled(player, selectedProj, "tnt");

                            const form = new ModalFormData()
                                .title(`${player}'s ${selectedProj} powers`)
                                .toggle("Lightning bolt", bolt)
                                .toggle("Freeze", freeze)
                                .toggle("TNT", tnt);
                            form.show(p).then(async result => {
                                const _bolt = result.formValues[0];
                                const boltstate = _bolt === true ? "on" : "off";

                                const _freeze = result.formValues[1];
                                const freezestate = _freeze === true ? "on" : "off";

                                const _tnt = result.formValues[2];
                                const tntstate = _tnt === true ? "on" : "off";

                                try {
                                    if (_bolt !== bolt) {
                                        await setPower(player, selectedProj, "bolt", boltstate);
                                    }
                                    if (_freeze !== freeze) {
                                        await setPower(player, selectedProj, "freeze", freezestate);
                                    }
                                    if (_tnt !== tnt) {
                                        await setPower(player, selectedProj, "tnt", tntstate);
                                    }
                                    await runTellraw(p, `§aThe powers have been set correctly. Showing current state of all the powers for §b${player}§a:\n§7* §bLightning bolt: ${boltstate === "on" ? "§a" : "§c"}${boltstate}\n§7* §bFreeze: ${freezestate === "on" ? "§a" : "§c"}${freezestate}\n§7* §bTNT: ${tntstate === "on" ? "§a" : "§c"}${tntstate}`);
                                } catch (e) {
                                    await runTellraw(p, `§cError, one or more powers couldn't be enabled/disabled.`);
                                    p.playSound("au.error");
                                }
                            });
                        }
                    });
                } else if (selection > 1) {
                    const selectedPlayer = playersArray[response.selection - 2];
                    const bolt = isPowerEnabled(selectedPlayer, selectedProj, "bolt");
                    const freeze = isPowerEnabled(selectedPlayer, selectedProj, "freeze");
                    const tnt = isPowerEnabled(selectedPlayer, selectedProj, "tnt");

                    const form = new ModalFormData()
                        .title(`${selectedPlayer}'s ${selectedProj} powers`)
                        .toggle("Lightning bolt", bolt)
                        .toggle("Freeze", freeze)
                        .toggle("TNT", tnt);
                    form.show(p).then(async result => {
                        if (result.canceled === true) return;

                        const _bolt = result.formValues[0];
                        const boltstate = _bolt === true ? "on" : "off";

                        const _freeze = result.formValues[1];
                        const freezestate = _freeze === true ? "on" : "off";

                        const _tnt = result.formValues[2];
                        const tntstate = _tnt === true ? "on" : "off";

                        try {
                            if (_bolt !== bolt) {
                                await setPower(selectedPlayer, selectedProj, "bolt", boltstate);
                            }
                            if (_freeze !== freeze) {
                                await setPower(selectedPlayer, selectedProj, "freeze", freezestate);
                            }
                            if (_tnt !== tnt) {
                                await setPower(selectedPlayer, selectedProj, "tnt", tntstate);
                            }
                            await runTellraw(p, `§aThe powers have been set correctly. Showing current state of all the powers for §b${selectedPlayer}§a:\n§7* §bLightning bolt: ${boltstate === "on" ? "§a" : "§c"}${boltstate}\n§7* §bFreeze: ${freezestate === "on" ? "§a" : "§c"}${freezestate}\n§7* §bTNT: ${tntstate === "on" ? "§a" : "§c"}${tntstate}`);
                        } catch (e) {
                            await runTellraw(p, `§cError, one or more powers couldn't be enabled/disabled.`);
                            p.playSound("au.error");
                        }
                    });
                }
            });
        }
    });
}

function vanishMenu(p) {
    const form = new ActionFormData()
        .title("Vanish menu")
        .body("Select an option")
        .button("§l<-- Back", "textures/icons/back.png")
        .button("Enable vanish mode for a player", "textures/icons/vanish.png")
        .button("Disable vanish mode for a player", "textures/icons/unVanish.png");
    form.show(p).then((response) => {
        switch (response.selection) {
            case 0:
                adminUtils(p);
                break;
            case 1:
                enableVanishGUI(p);
                break;
            case 2:
                disableVanishGUI(p);
                break;
            default:
                break;
        }
    });

}

function enableVanishGUI(p) {
    let availablePlayers = [];
    const form = new ActionFormData()
        .title("Enable vanish mode")
        .body("Select an online player to enable vanish mode for")
        .button("§l<-- Back", "textures/icons/back.png")
        .button("Type an offline/online player instead", "textures/icons/pencil.png")
        .button("Vanish myself", "textures/icons/vanish.png");
    for (const player of players.map(pname => pname.name)) {
        if (!isVanished(player) && player !== p.name) {
            form.button(player, "textures/icons/steve_icon.png");
            availablePlayers.push(player);
        }
    }

    form.show(p).then((response) => {
        const { selection } = response;
        if (response.canceled === true) return;
        if (selection === 0) {
            vanishMenu(p);

        } else if (selection === 1) {
            const form = new ModalFormData()
                .title("Enable vanish mode")
                .textField("Type below the player you would like to vanish.", "Player's name");
            form.show(p).then(result => {
                if (result.canceled === true) return;

                const player = result.formValues[0];
                if (!isValidUsername(player)) {
                    p.sendMessage("§cError, the username you entered is invalid.");
                    p.playSound("au.error");

                } else if (isVanished(player)) {
                    p.sendMessage("§cError, the specified player is already vanished.");
                    p.playSound("au.error");

                } else {
                    try {
                        world.scoreboard.getObjective('-auVanished').setScore(`-au${player}`, 0);
                        p.sendMessage(`§aThe player §b${player}§a has been vanished successfully.`);
                        p.playSound("au.success");
                    } catch (e) {
                        p.sendMessage(`§cError, couldn't vanish §4${player}§c.`);
                        p.playSound("au.error");
                    }
                }
            });
        } else if (selection === 2) {
            const form = new MessageFormData()
                .title("Enable vanish mode")
                .body("Are you sure you want to enable vanish mode for §byourself§r?")
                .button1("No")
                .button2("Yes");
            form.show(p).then(result => {
                if (result.canceled === true) return;
                if (result.selection === 0) {
                    enableVanishGUI(p);

                } else if (result.selection === 1) {
                    if (isVanished(p.name)) {
                        p.sendMessage("§cError, you are already vanished.");
                        p.playSound("au.error");

                    } else {
                        try {
                            world.scoreboard.getObjective('-auVanished').setScore(`-au${p.name}`, 0);
                            p.sendMessage(`§aYou have been vanished successfully.`);
                            p.playSound("au.success");
                        } catch (e) {
                            p.sendMessage("§cError, couldn't enable vanish mode.");
                            p.playSound("au.error");
                        }
                    }
                }
            });
        } else if (selection >= 3) {
            const selectedPlayer = availablePlayers[selection - 3];

            const form = new MessageFormData()
                .title("Enable vanish mode")
                .body(`Are you sure you want to vanish §b${selectedPlayer}§r?`)
                .button1("No")
                .button2("Yes");
            form.show(p).then(result => {
                if (result.canceled === true) return;
                if (result.selection === 0) {
                    enableVanishGUI(p);

                } else if (result.selection === 1) {
                    if (isVanished(selectedPlayer)) {
                        p.sendMessage("§cError, the selected player has recently been vanished by another user.");
                        p.playSound("au.error");

                    } else {
                        try {
                            world.scoreboard.getObjective('-auVanished').setScore(`-au${selectedPlayer}`, 0);
                            p.sendMessage(`§aThe player §b${selectedPlayer}§a has been vanished successfully.`);
                            p.playSound("au.success");
                        } catch (e) {
                            p.sendMessage("§cError, couldn't vanish the player.");
                            p.playSound("au.error");
                        }
                    }
                }
            });
        }
    });
}

function disableVanishGUI(p) {
    let availablePlayers = [];
    const form = new ActionFormData()
        .title("Disable vanish mode")
        .body("Select an offline/online vanished player to disable vanish mode for")
        .button("§l<-- Back", "textures/icons/back.png")
        .button("Type an offline/online player instead", "textures/icons/pencil.png")
        .button("Disable vanish mode for myself", "textures/icons/unVanish.png");
    for (const player of getVanishedPlayers()) {
        if (player !== p.name) {
            form.button(player, "textures/icons/steve_icon.png");
            availablePlayers.push(player);
        }
    }

    form.show(p).then((response) => {
        if (response.canceled === true) return;
        const { selection } = response;
        if (selection === 0) {
            vanishMenu(p);

        } else if (selection === 1) {
            const form = new ModalFormData()
                .title("Disable vanish mode")
                .textField("Type below the player you would like to disable vanish mode for.", "Player's name");
            form.show(p).then(result => {
                if (result.canceled === true) return;

                const player = result.formValues[0];
                if (!isValidUsername(player)) {
                    p.sendMessage("§cError, the username you entered is invalid.");
                    p.playSound("au.error");

                } else if (!isVanished(player)) {
                    p.sendMessage("§cError, the specified player isn't vanished.");
                    p.playSound("au.error");

                } else {
                    try {
                        world.scoreboard.getObjective('-auVanished').removeParticipant(`-au${player}`);
                        p.sendMessage(`§aVanish mode has been disabled successfully for §b${player}§a.`);
                        p.playSound("au.success");
                    } catch (e) {
                        p.sendMessage(`§cError, couldn't disable vanish mode for §4${player}§c.`);
                        p.playSound("au.error");
                    }
                }
            });
        } else if (selection === 2) {
            const form = new MessageFormData()
                .title("Disable vanish mode")
                .body("Are you sure you want to disable vanish mode for §byourself§r?")
                .button1("No")
                .button2("Yes");
            form.show(p).then(result => {
                if (result.canceled === true) return;
                if (result.selection === 0) {
                    disableVanishGUI(p);

                } else if (result.selection === 1) {
                    if (!isVanished(p.name)) {
                        p.sendMessage("§cError, you aren't vanished.");
                        p.playSound("au.error");

                    } else {
                        try {
                            world.scoreboard.getObjective('-auVanished').removeParticipant(`-au${p.name}`);
                            p.sendMessage(`§aVanish mode has been disabled successfully for you.`);
                            p.playSound("au.success");
                        } catch (e) {
                            p.sendMessage("§cError, couldn't disable vanish mode.");
                            p.playSound("au.error");
                        }
                    }
                }
            });
        } else if (selection >= 3) {
            const selectedPlayer = availablePlayers[selection - 3];

            const form = new MessageFormData()
                .title("Disable vanish mode")
                .body(`Are you sure you want to disable vanish mode for §b${selectedPlayer}§r?`)
                .button1("No")
                .button2("Yes");
            form.show(p).then(result => {
                if (result.canceled === true) return;
                if (result.selection === 0) {
                    disableVanishGUI(p);

                } else if (result.selection === 1) {
                    if (!isVanished(selectedPlayer)) {
                        p.sendMessage("§cError, another user has recently disabled vanish mode for the selected player.");
                        p.playSound("au.error");

                    } else {
                        try {
                            world.scoreboard.getObjective('-auVanished').removeParticipant(`-au${selectedPlayer}`);
                            p.sendMessage(`§aVanish mode has been disabled successfully for §b${selectedPlayer}§a.`);
                            p.playSound("au.success");
                        } catch (e) {
                            p.sendMessage(`§cError, couldn't disable vanish mode for §4${selectedPlayer}§c.`);
                            p.playSound("au.error");
                        }
                    }
                }
            });
        }
    });
}

/**
 *
 * @param { Player } p
 */

function seeInventoryMenu(p) {
    const playersArray = players.map(pname => pname.name);
    const form = new ActionFormData()
        .title("See an inventory");
    if (!isEnoughSpace(p)) {
        form.body("Select an online player to see their inventory inside a chest.\n§4WARNING§c, there isn't enough space in front of you, you won't be able to create a chest to see the inventory of a player. Make some space and try again.")
    } else {
        form.body("Select an online player to see their inventory inside a chest");
    }
    form.button("§l<-- Back", "textures/icons/back.png")
        .button("Type an offline/online player instead", "textures/icons/pencil.png")
        .button("Manage active chests", "textures/icons/manageChests.png");
    for (const player of playersArray) {
        form.button(player, "textures/icons/steve_icon.png");
    }

    form.show(p).then((response) => {
        if (response.canceled === true) return;
        const { selection } = response;
        if (selection === 0) { //Back
            adminUtils(p);

        } else if (selection === 1) { //Type manually
            const form = new ModalFormData()
                .title("See an inventory")
                .textField("§bType below the player you would like to see the inventory of.§r\nThis will place a large chest in front of you, so make sure there's enough space.", "Player's name");
            form.show(p).then(result => {
                if (result.canceled === true) return;
                const player = result.formValues[0];

                if (!isValidUsername(player)) {
                    p.sendMessage("§cError, the username you entered is invalid.");
                    p.playSound("au.error");

                } else if (isInvSeen(player)) {
                    const form = new MessageFormData()
                        .title("See an inventory")
                        .body(`The player §b${player}§r §lalready has a chest§r with his inventory. Are you sure you want to create another one?`)
                        .button1("No")
                        .button2("Yes");
                    form.show(p).then(result => {
                        if (result.selection === 0) {
                            seeInventoryMenu(p);
                        } else if (result.selection === 1) {
                            createChestInv(player);
                        }
                    });

                } else {
                    createChestInv(player);
                }
            });
        } else if (selection === 2) { //Manage active chests
            manageActiveChests();
            function manageActiveChests() {
                const repeatedPlayers = getInvSees()?.map(chest => chest.target);
                const nonRepeatedPlayers = repeatedPlayers?.reduce(function (accumulator, currentValue) {
                    if (accumulator.indexOf(currentValue) === -1) {
                        accumulator.push(currentValue);
                    }
                    return accumulator;
                }, []);

                const form = new ActionFormData()
                    .title("See an inventory: manage active chests")
                    .body("Select an option")
                    .button("§l<-- Back", "textures/icons/back.png");
                if (repeatedPlayers) {
                    for (const player of nonRepeatedPlayers) {
                        form.button(player, "textures/icons/steve_icon.png");
                    }
                }
                form.show(p).then((response) => {
                    if (response.canceled === true) return;
                    const { selection } = response;

                    if (selection === 0) { //Back
                        seeInventoryMenu(p);

                    } else if (selection >= 1) {
                        selectChest();
                        function selectChest() {
                            const selectedPlayer = nonRepeatedPlayers[selection - 1];
                            const chests = getInvSees().filter(chest => chest.target === selectedPlayer);

                            const form = new ActionFormData()
                                .title(`Manage active chests: §b${selectedPlayer}`)
                                .body("Select a chest")
                                .button("§l<-- Back", "textures/icons/back.png");
                            for (let i = 1; i <= chests.length; i++) {
                                form.button(`§lChest ${i}`, "textures/icons/chest.png");
                            }
                            form.show(p).then((response) => {
                                if (response.canceled === true) return;
                                const { selection: chestSelection } = response;
                                if (chestSelection === 0) { //Back
                                    manageActiveChests();

                                } else if (chestSelection >= 1) {
                                    chestOptions();
                                    function chestOptions() {
                                        const selectedChest = chests[chestSelection - 1];
                                        if (!getInvSees().some(chest => chest.scoreboard === selectedChest.scoreboard)) {
                                            p.sendMessage('§cError, the selected chest has recently been removed by another user.');
                                            p.playSound("au.error");

                                        } else {
                                            const _chestDim = selectedChest.dimension;
                                            let chestDim = '';
                                            switch (_chestDim) {
                                                case "overworld":
                                                    chestDim = '§bOverworld';
                                                    break;
                                                case "nether":
                                                    chestDim = '§cNether';
                                                    break;
                                                case "the_end":
                                                    chestDim = '§5The End';
                                                    break;
                                            }

                                            const form = new ActionFormData()
                                                .title(`§l§b${selectedPlayer}: §6chest ${chestSelection}`)
                                                .body(`Select an option. This chest is located at §a${selectedChest.signPos[0]}, ${selectedChest.signPos[1]}, ${selectedChest.signPos[2]}§r, ${chestDim}§r.`)
                                                .button("§l<-- Back", "textures/icons/back.png")
                                                .button("Teleport to this chest", "textures/icons/teleport.png")
                                            form.show(p).then((response) => {
                                                if (response.canceled === true) return;
                                                const { selection } = response;
                                                if (selection === 0) { //Back
                                                    selectChest();

                                                } else if (selection === 1) { //Teleport to the chest
                                                    if (!getInvSees().some(chest => chest.scoreboard === selectedChest.scoreboard)) {
                                                        p.sendMessage('§cError, the selected chest has recently been removed by another user.');
                                                        p.playSound("au.error");

                                                    } else {
                                                        const form = new MessageFormData()
                                                            .title(`§l§b${selectedPlayer}: §6chest ${chestSelection}`)
                                                            .body(`Are you sure you want to teleport to §b${selectedPlayer}'s chest§r located at §a${selectedChest.signPos[0]}, ${selectedChest.signPos[1]}, ${selectedChest.signPos[2]}§r, ${chestDim}§r?`)
                                                            .button1("No")
                                                            .button2("Yes");
                                                        form.show(p).then(async result => {
                                                            if (result.canceled === true) return;
                                                            if (result.selection === 0) {
                                                                chestOptions();
                                                            } else if (result.selection === 1) {
                                                                try {
                                                                    if (!getInvSees().some(chest => chest.scoreboard === selectedChest.scoreboard)) {
                                                                        p.sendMessage('§cError, the selected chest has recently been removed by another user.');
                                                                        p.playSound("au.error");

                                                                    } else {
                                                                        p.sendMessage('§bTeleporting...'); //Are you sure you want to teleport to.... (coords, dimension..)
                                                                        p.runCommand("camera @s set au:tpanimation ease 4 in_sine pos ~ ~100 ~ rot 90 0");
                                                                        await delay(20);
                                                                        p.runCommand("camera @s fade time 3 1 1 color 0 0 0");
                                                                        await delay(60);
                                                                        p.teleport({ x: selectedChest.signPos[0] + 0.5, y: selectedChest.signPos[1], z: selectedChest.signPos[2] + 0.5 }, { dimension: world.getDimension(selectedChest.dimension) });
                                                                        p.runCommand("camera @s clear");
                                                                        await delay(20);
                                                                        await runCmd(p, "playsound beacon.activate @s ~ ~ ~ 100");
                                                                        p.sendMessage('§bTeleported!');

                                                                    }
                                                                } catch (e) {
                                                                    p.sendMessage("§cError, couldn't teleport you to the chest.");
                                                                    p.playSound("au.error");
                                                                }
                                                            }
                                                        });
                                                    }

                                                }
                                            });
                                        }
                                    }
                                }
                            });
                        }
                    }
                });
            }
        } else if (selection >= 3) {
            const selectedPlayer = playersArray[selection - 3];
            const form = new MessageFormData()
                .title("See an inventory")
                .body(`Are you sure you want to create a chest to see the inventory of §b${selectedPlayer}§r?\nThis will place a large chest in front of you, so make sure there's enough space.`)
                .button1("No")
                .button2("Yes");
            form.show(p).then(result => {
                if (result.canceled === true) return;
                if (result.selection === 0) {
                    seeInventoryMenu(p);
                } else if (result.selection === 1) {
                    if (isInvSeen(selectedPlayer)) {
                        const form = new MessageFormData()
                            .title("See an inventory")
                            .body(`The player §b${selectedPlayer}§r §lalready has a chest§r with his inventory. Are you sure you want to create another one?`)
                            .button1("No")
                            .button2("Yes");
                        form.show(p).then(result => {
                            if (result.selection === 0) {
                                seeInventoryMenu(p);
                            } else if (result.selection === 1) {
                                createChestInv(selectedPlayer);
                            }
                        });
                    } else {
                        createChestInv(selectedPlayer);
                    }
                }
            });
        }
        function createChestInv(player) {
            try {
                if (!isEnoughSpace(p)) {
                    p.sendMessage("§cError, there isn't enough space in front of you to create the chest. Make some space or move to another place and try again.");
                    p.playSound("au.error");

                } else {
                    const YRot = p.getRotation().y;
                    const loc = p.location;
                    let frontLoc1;
                    let frontLoc2;
                    if (YRot > -45 && YRot < 45) { //Chest & sign placement
                        frontLoc1 = { x: loc.x, y: loc.y, z: loc.z + 1 };
                        frontLoc2 = { x: loc.x - 1, y: loc.y, z: loc.z + 1 };
                        p.runCommand(`structure load AdminUtils:invchest ${loc.x - 1} ${loc.y} ${loc.z} 180_degrees`);
                    } else if (YRot >= 45 && YRot < 135) {
                        frontLoc1 = { x: loc.x - 1, y: loc.y, z: loc.z };
                        frontLoc2 = { x: loc.x - 1, y: loc.y, z: loc.z - 1 };
                        p.runCommand(`structure load AdminUtils:invchest ${loc.x - 1} ${loc.y} ${loc.z - 1} 270_degrees`);
                    } else if ((YRot >= 135 && YRot < 180) || (YRot > -180 && YRot < -135)) { //Also: (YRot + 180 - (180 - YRot) * 2) > -45
                        frontLoc1 = { x: loc.x, y: loc.y, z: loc.z - 1 };
                        frontLoc2 = { x: loc.x + 1, y: loc.y, z: loc.z - 1 };
                        p.runCommand(`structure load AdminUtils:invchest ${loc.x} ${loc.y} ${loc.z - 1}`);
                    } else if (YRot >= -135 && YRot <= -45) {
                        frontLoc1 = { x: loc.x + 1, y: loc.y, z: loc.z };
                        frontLoc2 = { x: loc.x + 1, y: loc.y, z: loc.z + 1 };
                        p.runCommand(`structure load AdminUtils:invchest ${loc.x} ${loc.y} ${loc.z} 90_degrees`);
                    }
                    const signComponent = p.dimension.getBlock(loc).getComponent("minecraft:sign");
                    signComponent.setText(`§b${player}'s §qinventory`);
                    signComponent.setWaxed(true);

                    world.scoreboard.getObjective('-auInvSees').setScore(`-au${p.dimension.id.replace(/minecraft:/, '')} -au${player} -au${Math.floor(frontLoc1.x)} -au${Math.floor(frontLoc1.y)} -au${Math.floor(frontLoc1.z)} -au${Math.floor(frontLoc2.x)} -au${Math.floor(frontLoc2.y)} -au${Math.floor(frontLoc2.z)} -au${Math.floor(loc.x)} -au${Math.floor(loc.y)} -au${Math.floor(loc.z)}`, 0);
                    p.sendMessage(`§aThe chest has been created successfully with §b${player}'s §ainventory inside.`);
                    p.playSound("au.success");
                }
            } catch (e) {
                p.sendMessage("§cError, couldn't create the chest.");
                p.playSound("au.error");
                console.warn(e);
            }
        }
    });
}

function runCmd(obj, cmd) {
    return obj.runCommandAsync(cmd);
}

function runTellraw(player, txt) {
    return player.runCommandAsync(`execute @s ~~~ tellraw @s {"rawtext": [{ "text": "${txt}" }]}`);
}

export function isValidUsername(username) {
    if (username.match(/^ | $/) !== null || username.match(/[^A-Za-z0-9À-ÿ\u00f1\u00d1 \(\)]+/) !== null || username === "") {
        return false;
    } else if (username.match(/^ | $/) === null && username.match(/[^A-Za-z0-9À-ÿ\u00f1\u00d1 \(\)]+/) === null && username !== "") {
        return true;
    }
}

function isAdmin(username) {
    return admins.includes(`-au${username}-au`);
}

function isOwner(username) {
    return world.scoreboard.getObjective('-auOwner').getParticipants()[0]?.displayName === `-au${username}-au`;
}

function isBanned(player) {
    const bannedPlayers = getBannedPlayers();
    return bannedPlayers.includes(player);
}

function isPermaBanned(player) {
    return getUnBanISO(player) === "-aupermabanned-au";
}

function isBanTimeOver(player) {
    try {
        const unBanDate = moment(getUnBanISO(player), moment.ISO_8601);
        const currentDate = moment();
        const remainingTime = moment.duration(unBanDate.diff(currentDate));
        const milliseconds = remainingTime.asMilliseconds();
        return milliseconds <= 0;
    } catch (e) { return; }
}

function getBannedPlayers() {
    try {
        return world.scoreboard.getObjective('-auBan').getParticipants().map(participant => participant.displayName.match(/^[^]+(?=-aureason)/)[0]);
    } catch (e) {
        return;
    }
}

function getBanReason(player) {
    let bannedPlayers = [];
    for (const bannedRawPlayer of world.scoreboard.getObjective('-auBan').getParticipants()) {
        bannedPlayers.push(bannedRawPlayer.displayName.match(/^[^]+(?=-aureason)/)[0]);
    }

    let banReasons = [];
    for (const bannedRawPlayer of world.scoreboard.getObjective('-auBan').getParticipants()) {
        banReasons.push(bannedRawPlayer.displayName.match(/(?<=-aureason)[^]+(?=-auban)/)[0]);
    }
    return banReasons[bannedPlayers.indexOf(player)];
}

function getBannedBy(player) {
    let bannedPlayers = [];
    for (const bannedRawPlayer of world.scoreboard.getObjective('-auBan').getParticipants()) {
        bannedPlayers.push(bannedRawPlayer.displayName.match(/^[^]+(?=-aureason)/)[0]);
    }

    let bannedBys = [];
    for (const bannedRawPlayer of world.scoreboard.getObjective('-auBan').getParticipants()) {
        bannedBys.push(bannedRawPlayer.displayName.match(/.*-auban([^]+)-autime/)[1]);
    }
    return bannedBys[bannedPlayers.indexOf(player)];
}

function getUnBanISO(player) {
    const bannedParticipants = world.scoreboard.getObjective('-auBan').getParticipants();
    const matchISO = new RegExp(`(?<=^${convertToRegExpFriendly(player)}-aureason.+-autime)(?!.*-auban)[^]+`);
    const scoreboard = bannedParticipants.filter(participant => matchISO.test(participant.displayName))[0].displayName;
    return scoreboard.match(matchISO)[0];
}

function isJailed(player) {
    //MisledPaul58976-aureason.....-aujailedby......-autime.....
    const jailedPlayers = world.scoreboard.getObjective('-auJailed').getParticipants();
    const regexp = new RegExp(`^${convertToRegExpFriendly(player)}(?=-aureason)`);
    return jailedPlayers.some(player => regexp.test(player.displayName));
}

function isJailLocSet() {
    const scoreboard = world.scoreboard.getObjective('-auJailLoc').getParticipants()[0]?.displayName;
    return !!scoreboard;
}

function isJailExitLocSet() {
    const scoreboard = world.scoreboard.getObjective('-auJailExitLoc').getParticipants()[0]?.displayName;
    return !!scoreboard;
}

function isPermaJailed(player) {
    return getReleaseISO(player) === "-aupermajailed-au";
}

function isJailTimeOver(player) {
    try {
        const releaseDate = moment(getReleaseISO(player), moment.ISO_8601);
        const currentDate = moment();
        const remainingTime = moment.duration(releaseDate.diff(currentDate));
        const milliseconds = remainingTime.asMilliseconds();
        return milliseconds <= 0;
    } catch (e) { return; }
}

function hasJailedPlJoined(player) {
    const jailedParticipants = world.scoreboard.getObjective('-auJailed').getParticipants();
    const regexp = new RegExp(`^${convertToRegExpFriendly(player)}-aureason.+-aujailedby.+-autime.+-auhasjoined([^]+)`);
    const scoreboard = jailedParticipants.find(participant => regexp.test(participant.displayName))?.displayName.match(regexp)[1];
    if (scoreboard) {
        if (scoreboard === "true") {
            return true;
        } else if (scoreboard === "false") {
            return false;
        }
    } else {
        return;
    }
}

function getJailedPlayers() {
    try {
        return world.scoreboard.getObjective('-auJailed').getParticipants().map(participant => participant.displayName.match(/^[^]+(?=-aureason)/)[0]);
    } catch (e) {
        return;
    }
}

function getJailReason(player) {
    const jailedParticipants = world.scoreboard.getObjective('-auJailed').getParticipants();
    const regexp = new RegExp(`^${convertToRegExpFriendly(player)}-aureason([^]+)-aujailedby.+`);
    const scoreboard = jailedParticipants.find(participant => regexp.test(participant.displayName))?.displayName;
    return scoreboard?.match(regexp)[1];
}

/**
 *
 * @param { String } player
 * @returns { String | undefined }
 */

function getJailedBy(player) {
    const jailedParticipants = world.scoreboard.getObjective('-auJailed').getParticipants();
    const regexp = new RegExp(`^${convertToRegExpFriendly(player)}-aureason.+-aujailedby([^]+)-autime.+`);
    const scoreboard = jailedParticipants.find(participant => regexp.test(participant.displayName))?.displayName;
    return scoreboard?.match(regexp)[1];
}

function getReleaseISO(player) {
    const jailedParticipants = world.scoreboard.getObjective('-auJailed').getParticipants();
    const matchISO = new RegExp(`^${convertToRegExpFriendly(player)}-aureason.+-aujailedby.+-autime([^]+)-auhasjoined.+`); //Also works: `(?<=^${convertToRegExpFriendly(player)}-aureason.+-aujailedby.+-autime)(?!.*-aujailedby)[^]+(?=-auhasjoined.+)`
    const scoreboard = jailedParticipants.find(participant => matchISO.test(participant.displayName))?.displayName;
    return scoreboard?.match(matchISO)[1];
}

function getReleaseMillisecondsLeft(player) {
    if (!isPermaJailed(player)) {
        const releaseDate = moment(getReleaseISO(player), moment.ISO_8601);
        const currentDate = moment();
        const remainingTime = moment.duration(releaseDate.diff(currentDate));
        return remainingTime.asMilliseconds();
    } else {
        return;
    }
}

function getJailLoc() {
    //-auoverworld -au-46.123164 -au64 -au79.01385315
    const positions = world.scoreboard.getObjective('-auJailLoc').getParticipants()[0]?.displayName.match(/-au(-?[0-9]+[^]*) -au(-?[0-9]+[^]*) -au(-?[0-9]+[^]*)/).slice(1).map(pos => parseFloat(pos));
    const dimension = world.scoreboard.getObjective('-auJailLoc').getParticipants()[0]?.displayName.match(/(?<=-au)overworld|nether|the_end/)[0];
    if (!positions) {
        world.sendMessage('pos fail');
        return;
    } else {
        return [{ x: positions[0], y: positions[1], z: positions[2] }, { dimension: world.getDimension(dimension) }];
    }
}

function getJailExitLoc() {
    const positions = world.scoreboard.getObjective('-auJailExitLoc').getParticipants()[0]?.displayName.match(/-au(-?[0-9]+[^]*) -au(-?[0-9]+[^]*) -au(-?[0-9]+[^]*)/).slice(1).map(pos => parseFloat(pos));
    const dimension = world.scoreboard.getObjective('-auJailExitLoc').getParticipants()[0]?.displayName.match(/(?<=-au)overworld|nether|the_end/)[0];
    if (!positions) {
        world.sendMessage('pos fail');
        return;
    } else {
        return [{ x: positions[0], y: positions[1], z: positions[2] }, { dimension: world.getDimension(dimension) }];
    }
}

/**
 *
 * @param { String } player
 * @returns { Boolean }
 */

function isVanished(player) {
    const vanishedPlayers = getVanishedPlayers();
    return vanishedPlayers.includes(player);
}

function getVanishedPlayers() {
    try {
        return world.scoreboard.getObjective('-auVanished').getParticipants().map(participant => participant.displayName.match(/(?<=^-au)[^]+/)?.[0]).filter(p => p);
    } catch (e) {
        return;
    }
}

function isPowerEnabled(pname, projectile, power) {
    let projScoreboard = [];
    try { projScoreboard = [...world.scoreboard.getObjective('-auProj').getParticipants().map(participant => participant.displayName)] } catch (e) { }
    const regexp = new RegExp(`(?<=-au${convertToRegExpFriendly(pname)}-au.*\\+${projectile}[^+]*-${power})on`);
    return projScoreboard.some(participant => {
        try {
            if (participant.match(regexp)[0] === "on") return true;
        } catch (e) {
        }
    });
}

async function setPower(pname, projectile, power, state) {
    let projScoreboard = [];
    try { projScoreboard = [...world.scoreboard.getObjective('-auProj').getParticipants().map(participant => participant.displayName).filter(participant => participant.includes(`-au${pname}-au`))] } catch (e) { }
    const regexp = new RegExp(`(?<=-au${convertToRegExpFriendly(pname)}-au.*\\+${projectile}[^+]*-${power})(?:on|off)`); //"+" is escaped two times because of the ``

    if (projScoreboard.length !== 0) { //If the array is not empty
        try { await runCmd(overworld, `scoreboard players reset "${projScoreboard[0]}" -auProj`) } catch (e) { }
        const newScoreboard = projScoreboard[0].replace(regexp, state);
        await runCmd(overworld, `scoreboard players set "${newScoreboard}" -auProj 0`);

    } else { //If the array is empty
        const scoreboard = `-au${pname}-au+snowball-boltoff-freezeoff-tntoff+arrow-boltoff-freezeoff-tntoff+egg-boltoff-freezeoff-tntoff`;
        const newScoreboard = scoreboard.replace(regexp, state);
        await runCmd(overworld, `scoreboard players set "${newScoreboard}" -auProj 0`);
    }
}

function isFrozen(player) {
    try {
        return world.scoreboard.getObjective('-auFrozen').getParticipants().map(participant => participant.displayName.match(/-auname([^]*) -au-?(?:[0-9]+[^]*|\+) -au-?(?:[0-9]+[^]*|\+) -au-?(?:[0-9]+[^]*|\+)/)[1]).includes(player);
    } catch (e) { return false }
}

/**
 *
 * @param { String } player
 * @returns { Boolean }
 */

function isInvSeen(player) {
    try {
        const participants = world.scoreboard.getObjective('-auInvSees').getParticipants().map(participant => participant.displayName);
        if (!participants[0]) {
            return false;
        } else {
            return getInvSees().map(chest => chest.target).includes(player);
        }
    } catch (e) {
        return;
    }
}

/**
 * Returns true if there's enough space for a large chest just in front of the player, if not, returns false.
 * @param { Player } rawPlayer
 * @returns { Boolean }
 */

function isEnoughSpace(rawPlayer) {
    const YRot = rawPlayer.getRotation().y;
    const loc = rawPlayer.location;
    try {
        const currentBlock = rawPlayer.dimension.getBlock(loc);
        if (!currentBlock.isAir) return false;

        if (YRot > -45 && YRot < 45) {
            const frontLoc1 = { x: loc.x, y: loc.y, z: loc.z + 1 };
            const frontLoc2 = { x: loc.x - 1, y: loc.y, z: loc.z + 1 };
            const block1 = rawPlayer.dimension.getBlock(frontLoc1);
            const block2 = rawPlayer.dimension.getBlock(frontLoc2);
            if (block1.isAir && block2.isAir) return true
            else return false;

        } else if (YRot > 45 && YRot < 135) {
            const frontLoc1 = { x: loc.x - 1, y: loc.y, z: loc.z };
            const frontLoc2 = { x: loc.x - 1, y: loc.y, z: loc.z - 1 };
            const block1 = rawPlayer.dimension.getBlock(frontLoc1);
            const block2 = rawPlayer.dimension.getBlock(frontLoc2);
            if (block1.isAir && block2.isAir) return true
            else return false;

        } else if ((YRot > 135 && YRot < 180) || (YRot > -180 && YRot < -135)) { //Also: (YRot + 180 - (180 - YRot) * 2) > -45
            const frontLoc1 = { x: loc.x, y: loc.y, z: loc.z - 1 };
            const frontLoc2 = { x: loc.x + 1, y: loc.y, z: loc.z - 1 };
            const block1 = rawPlayer.dimension.getBlock(frontLoc1);
            const block2 = rawPlayer.dimension.getBlock(frontLoc2);
            if (block1.isAir && block2.isAir) return true
            else return false;

        } else if (YRot > -135 && YRot < -45) {
            const frontLoc1 = { x: loc.x + 1, y: loc.y, z: loc.z };
            const frontLoc2 = { x: loc.x + 1, y: loc.y, z: loc.z + 1 };
            const block1 = rawPlayer.dimension.getBlock(frontLoc1);
            const block2 = rawPlayer.dimension.getBlock(frontLoc2);
            if (block1.isAir && block2.isAir) return true
            else return false;
        }
    } catch (e) {
        console.warn(e);
        return false;
    }
}

function getInvSees() {
    //-auoverworld -auPaul58 -au-46 -au64 -au79 -au-46 -au64 -au80
    try {
        const participants = world.scoreboard.getObjective('-auInvSees').getParticipants().map(participant => participant.displayName);
        if (!participants[0]) {
            return;
        } else {
            let chests = [];
            for (const chest of participants) {
                const properties = {
                    dimension: chest.match(/(?<=^-au)overworld|nether|the_end/)[0],
                    target: chest.match(/^-au(?:overworld|nether|the_end) -au([^]+?) -au-?[0-9]+/)[1],
                    pos1: chest.match(/^-au(?:overworld|nether|the_end) -au[^]+? -au(-?[0-9]+) -au(-?[0-9]+) -au(-?[0-9]+) -au-?[0-9]+/).slice(1).map(pos => parseInt(pos)),
                    pos2: chest.match(/^-au(?:overworld|nether|the_end).+ -au(-?[0-9]+) -au(-?[0-9]+) -au(-?[0-9]+) -au-?[0-9]+ -au-?[0-9]+ -au-?[0-9]+$/).slice(1).map(pos => parseInt(pos)),
                    signPos: chest.match(/^-au(?:overworld|nether|the_end).+ -au(-?[0-9]+) -au(-?[0-9]+) -au(-?[0-9]+)$/).slice(1).map(pos => parseInt(pos)),
                    scoreboard: chest
                }
                chests.push(properties);
            }
            return chests;
        }
    } catch (e) {
        return;
    }
}

/**
 *
 * @param { { dimension: string, target: string, pos1: number[], pos2: number[], signPos: number[], scoreboard: string } } chestObject
 * @param { [{ invItems: [], equipments: [] }, { invItems: [], equipments: [] }] } lastTargetData
 * @param { [{ invItems: [], equipments: [] }, { invItems: [], equipments: [] }] } lastChestData
 * @param { { inv: [], equip: [] } } recentlyChangedSlots
 * @param { "inv" | "chest" } forceReplace Useful when you want to override the inventory with the chest, for example, if the player has just joined and you can't compare the containers to identify a change.
 * Default is false.
 */

async function handleInventories(chestObject, lastTargetData, lastChestData, recentlyChangedSlots, forceReplace = false) {
    const rawTarget = world.getPlayers({ name: chestObject.target })[0];
    const dimension = world.getDimension(chestObject.dimension);
    const chest1 = dimension.getBlock({ x: chestObject.pos1[0], y: chestObject.pos1[1], z: chestObject.pos1[2] });

    const chestContainer = chest1.getComponent("minecraft:inventory").container;
    const targetInventory = rawTarget.getComponent("minecraft:inventory").container;
    const targetEquipments = rawTarget.getComponent("minecraft:equippable");

    let changedSlots = {
        inv: [],
        equip: []
    };
    let oldChestInv = [];
    let oldTargetInv = [];
    let oldChestEquip = [];
    let oldTargetEquip = [];
    const chestEquipSlots = [0, 1, 2, 3, 8];
    const targetEquipSlots = ["Head", "Chest", "Legs", "Feet", "Offhand"];

    if (forceReplace === false) {
        for (let slot = 18; slot < 54; slot++) { //Save chest inventory (without including the top part with the equipment)
            oldChestInv.push(chestContainer.getItem(slot));
        }
        for (let slot = 9; slot < 36; slot++) { //Save inventory (without including the hotbar yet)
            oldTargetInv.push(targetInventory.getItem(slot));
        }
        for (let slot = 0; slot < 9; slot++) { //Save hotbar
            oldTargetInv.push(targetInventory.getItem(slot));
        }

        for (const slot of chestEquipSlots) {
            oldChestEquip.push(chestContainer.getItem(slot));
        }
        for (const slot of targetEquipSlots) {
            oldTargetEquip.push(targetEquipments.getEquipment(slot));
        }
    }

    //Drop any item placed on the slots that are supposed to be empty
    const emptySlots = [4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15, 16, 17];
    let items = [];
    for (const slot of emptySlots) {
        items.push(chestContainer.getItem(slot));
    }
    for (const index in items) {
        if (items[index] !== undefined) {
            chestContainer.setItem(emptySlots[index], undefined);
            dimension.spawnItem(items[index], { x: chestObject.pos1[0], y: chestObject.pos1[1] + 1, z: chestObject.pos1[2] });
        }
    }
    await delay(10);

    let newChestInv = [];
    let newTargetInv = [];
    let newChestEquip = [];
    let newTargetEquip = [];

    for (let slot = 18; slot < 54; slot++) { //Save chest inventory (without including the top part with the equipment)
        newChestInv.push(chestContainer.getItem(slot));
    }
    for (let slot = 9; slot < 36; slot++) { //Save inventory (without including the hotbar yet)
        newTargetInv.push(targetInventory.getItem(slot));
    }
    for (let slot = 0; slot < 9; slot++) { //Save hotbar
        newTargetInv.push(targetInventory.getItem(slot));
    }

    for (const slot of chestEquipSlots) {
        newChestEquip.push(chestContainer.getItem(slot));
    }
    for (const slot of targetEquipSlots) {
        newTargetEquip.push(targetEquipments.getEquipment(slot));
    }

    if (forceReplace === false) {
        //Inventories
        for (let i = 0; i < oldChestInv.length; i++) {
            if (areItemsEqual(oldTargetInv[i], newTargetInv[i]) === false && areItemsEqual(newChestInv[i], newTargetInv[i]) === false) {
                //Means the item of the inventory at 'i' has changed, update chest
                chestContainer.setItem(i + 18, newTargetInv[i]);
                changedSlots.inv.push(i);
            } else if (!recentlyChangedSlots.inv.includes(i) && areItemsEqual(lastTargetData[0].invItems[i], oldTargetInv[i]) === false && areItemsEqual(lastTargetData[0].invItems[i], lastTargetData[1].invItems[i]) === true) {
                //Means the item of the inventory at 'i' changed last time this function was called but when the variables where already filled, so no change was detected
                chestContainer.setItem(i + 18, newTargetInv[i]);
                changedSlots.inv.push(i);
            } else if (areItemsEqual(oldChestInv[i], newChestInv[i]) === false && areItemsEqual(newChestInv[i], newTargetInv[i]) === false) {
                //Means the item of the chest at 'i' has changed, update inventory
                if (i >= 27) { //Translate the slot from the array to the slot in the inventory
                    const translatedSlot = i - 27;
                    targetInventory.setItem(translatedSlot, newChestInv[i]);
                } else {
                    const translatedSlot = i + 9;
                    targetInventory.setItem(translatedSlot, newChestInv[i]);
                }
                changedSlots.inv.push(i);
            } else if (!recentlyChangedSlots.inv.includes(i) && areItemsEqual(lastChestData[0].invItems[i], oldChestInv[i]) === false && areItemsEqual(lastChestData[0].invItems[i], lastChestData[1].invItems[i]) === true) {
                //Means the item of the chest at 'i' changed last time this function was called but when the variables where already filled, so no change was detected
                if (i >= 27) { //Translate the slot from the array to the slot in the inventory
                    const translatedSlot = i - 27;
                    targetInventory.setItem(translatedSlot, newChestInv[i]);
                } else {
                    const translatedSlot = i + 9;
                    targetInventory.setItem(translatedSlot, newChestInv[i]);
                }
                changedSlots.inv.push(i);
            }
        }

        //Equipment
        for (let i = 0; i < oldChestEquip.length; i++) {
            if (areItemsEqual(oldTargetEquip[i], newTargetEquip[i]) === false && areItemsEqual(newChestEquip[i], newTargetEquip[i]) === false) {
                //Means the equipment item of the inventory at 'i' has changed, update chest
                chestContainer.setItem(chestEquipSlots[i], newTargetEquip[i]);
                changedSlots.equip.push(i);
            } else if (!recentlyChangedSlots.equip.includes(i) && areItemsEqual(lastTargetData[0].equipments[i], oldTargetEquip[i]) === false && areItemsEqual(lastTargetData[0].equipments[i], lastTargetData[1].equipments[i]) === true) {
                //Means the equipment item of the inventory at 'i' changed last time this function was called but when the variables where already filled, so no change was detected
                chestContainer.setItem(chestEquipSlots[i], newTargetEquip[i]);
                changedSlots.equip.push(i);
            } else if (areItemsEqual(oldChestEquip[i], newChestEquip[i]) === false && areItemsEqual(newChestEquip[i], newTargetEquip[i]) === false) {
                //Means the equipment item of the chest at 'i' has changed, update inventory
                targetEquipments.setEquipment(targetEquipSlots[i], newChestEquip[i]);
                changedSlots.equip.push(i);
            } else if (!recentlyChangedSlots.equip.includes(i) && areItemsEqual(lastChestData[0].equipments[i], oldChestEquip[i]) === false && areItemsEqual(lastChestData[0].equipments[i], lastChestData[1].equipments[i]) === true) {
                //Means the equipment item of the chest at 'i' changed last time this function was called but when the variables where already filled, so no change was detected
                targetEquipments.setEquipment(targetEquipSlots[i], newChestEquip[i]);
                changedSlots.equip.push(i);
            }
        }

    } else if (forceReplace === "inv") {
        for (let i = 0; i < newChestInv.length; i++) {
            //Update inventory
            if (i >= 27) { //Translate the slot from the array to the slot in the inventory
                const translatedSlot = i - 27;
                targetInventory.setItem(translatedSlot, newChestInv[i]);
            } else {
                const translatedSlot = i + 9;
                targetInventory.setItem(translatedSlot, newChestInv[i]);
            }
        }
        for (let i = 0; i < newChestEquip.length; i++) {
            //Update inventory equipment
            targetEquipments.setEquipment(targetEquipSlots[i], newChestEquip[i]);
        }
    } else if (forceReplace === "chest") {
        for (let i = 0; i < newChestInv.length; i++) {
            //Update chest inventory
            chestContainer.setItem(i + 18, newTargetInv[i]);
        }
        for (let i = 0; i < newChestEquip.length; i++) {
            //Update chest equipment
            chestContainer.setItem(chestEquipSlots[i], newTargetEquip[i]);
        }
    }
    //Fill and replace backup variables (pass by reference)
    Object.assign(lastTargetData[1], lastTargetData[0]);
    lastTargetData[0].invItems = newTargetInv;
    lastTargetData[0].equipments = newTargetEquip;

    Object.assign(lastChestData[1], lastChestData[0]);
    lastChestData[0].invItems = newChestInv;
    lastChestData[0].equipments = newChestEquip;

    Object.assign(recentlyChangedSlots, changedSlots);
}

export function convertToRegExpFriendly(str) {
    return str.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');
}

function round(num, decimals = 2) {
    var sign = (num >= 0 ? 1 : -1);
    num = num * sign;
    if (decimals === 0) //with 0 decimals
        return sign * Math.round(num);
    // round(x * 10 ^ decimals)
    num = num.toString().split('e');
    num = Math.round(+(num[0] + 'e' + (num[1] ? (+num[1] + decimals) : decimals)));
    // x * 10 ^ (-decimals)
    num = num.toString().split('e');
    return sign * (num[0] + 'e' + (num[1] ? (+num[1] - decimals) : -decimals));
}

/**
 * @param { {} } obj1
 * @param { {} } obj2
 * @returns { Boolean }
 */
export function areObjectsEqual(obj1, obj2) {
    let objEqual = false;
    const obj1Keys = Object.keys(obj1).sort();
    const obj2Keys = Object.keys(obj2).sort();
    if (obj1Keys.length === obj2Keys.length) {
        const areEqual = obj1Keys.every((key, index) => {
            const objValue1 = obj1[key];
            const objValue2 = obj2[obj2Keys[index]];
            return objValue1 === objValue2;
        });
        if (areEqual) {
            objEqual = true;
        }
    }
    return objEqual;
}

/**
 *
 * @param { ItemStack } itemStack1
 * @param { ItemStack } itemStack2
 * @returns { Boolean }
 */
function areItemsEqual(itemStack1, itemStack2) {
    if (itemStack1 && itemStack2) {
        const itemProperties = ['amount', 'isStackable', 'keepOnDeath', 'lockMode', 'maxAmount', 'nameTag', 'typeId'];
        const itemMethods = ['getCanDestroy', 'getCanPlaceOn', 'getLore', 'getTags'];

        let itemData1 = getItemData(itemStack1);
        let itemData2 = getItemData(itemStack2);

        return itemData1.every((value, index) => value === itemData2[index]);

        function getItemData(itemStack) {
            let itemData = [];
            for (const property of itemProperties) {
                itemData.push(itemStack[property]);
            }

            itemData.push(itemStack.getComponent(ItemComponentTypes.Durability)?.damage);
            itemData.push(itemStack.getComponent(ItemComponentTypes.Durability)?.maxDurability);
            const enchantments = itemStack.getComponent(ItemComponentTypes.Enchantable)?.getEnchantments();
            if (enchantments) {
                for (const enchantment of enchantments) {
                    itemData.push(enchantment.level);
                    itemData.push(enchantment.type.id);
                    itemData.push(enchantment.type.maxLevel);
                }
            }

            for (const method of itemMethods) {
                itemData.push(itemStack[method]().toString());
            }

            return itemData;
        }
    } else if ((itemStack1 && !itemStack2) || (!itemStack1 && itemStack2)) {
        return false;
    } else {
        return true;
    }
}

/**
 *
 * @param { "minecraft:overworld" | "minecraft:nether" | "minecraft:the_end" } dimensionId
 * @returns { "§bOverworld" | "§cNether" | "§5The End" }
 */
export function toFancyDim(dimensionId) {
    let dimension = "";
    if (dimensionId === "minecraft:overworld") {
        dimension = '§bOverworld';
    } else if (dimensionId === "minecraft:nether") {
        dimension = '§cNether';
    } else if (dimensionId === "minecraft:the_end") {
        dimension = '§5The End';
    }
    return dimension;
}

/**
 *
 * @param { "§bOverworld" | "§cNether" | "§5The End" } fancyDim
 * @returns { "minecraft:overworld" | "minecraft:nether" | "minecraft:the_end" }
 */
export function toDimId(fancyDim) {
    let dimId = "";
    if (fancyDim === "§bOverworld") {
        dimId = "minecraft:overworld";
    } else if (fancyDim === "§cNether") {
        dimId = "minecraft:nether";
    } else if (fancyDim === "§5The End") {
        dimId = "minecraft:the_end";
    }
    return dimId;
}
