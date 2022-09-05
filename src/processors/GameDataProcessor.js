import store from "../redux/store/index";
import clone from "lodash.clonedeep";

import Constants from "../constants/index";
import SkillData from "../constants/SkillData";
import PlayerProcessor from "./PlayerProcessor";

import LocalizationService from "../services/LocalizationService";
import TTSService from "../services/TTSService";
import UsageService from "../services/UsageService";
import SpellService from "../services/SpellService";

import { createUUID } from "../helpers/UUIDHelper";

class GameDataProcessor  {
	normalizeFieldLocale(value) {
		let foreign_number_regex = /[\d]+,[\d]{2}(%|K)?$/;
		let matches              = String(value).match(foreign_number_regex);
		let match                = (matches && matches.length) ? matches[0] : false;

		if (match === false) {
			return value;
		}

		return value.replace(match, String(match).replace(",", "."));
	}

	normalizeLocales(data, language, current_state, loading_sample) {
		if (data.Encounter) {
			return this.normalizeGameData(data, language, current_state, loading_sample);
		}

		if (data.AggroList) {
			return this.normalizeAggroList(data);
		}

		return data;
	}

	normalizeGameData(data, language, current_state, loading_sample) {
		data.Encounter.name             = LocalizationService.getOverlayText("encounter", language);
		data.Encounter.Job              = "ENC";
		data.Encounter.OverHealPct      = "0%";
		data.Encounter.BlockPct         = "0%";
		data.Encounter.DirectHitPct     = "0%";
		data.Encounter.CritDirectHitPct = "0%";
		data.Encounter["damage%"]       = "100%";
		data.Encounter["healed%"]       = "100%";

		for (let key in Constants.PlayerDataTitles) {
			if (data.Encounter[key] !== undefined) {
				data.Encounter[key] = this.normalizeFieldLocale(data.Encounter[key]);
			}
		}

		for (let player_name in data.Combatant) {
			for (let key in Constants.PlayerDataTitles) {
				if (data.Combatant[player_name][key] !== undefined) {
					data.Combatant[player_name][key] = this.normalizeFieldLocale(data.Combatant[player_name][key]);
				}
			}

			if ((data.Combatant[player_name].Job || "").toLowerCase() === "limit break") {
				data.Combatant[player_name].Job = "LMB";
			}

			data.Combatant[player_name].UUID = createUUID();
		}

		data = this.injectMaxDPS(data, current_state, loading_sample);

		return data;
	}

	injectMaxDPS(data, current_state, loading_sample) {
		if (!current_state || !UsageService.usingMaxDPS(current_state.settings_data)) {
			return data;
		}

		let can_calculate_max = (!loading_sample && data.Encounter.DURATION >= 30);

		for (let player_name in data.Combatant) {
			data.Combatant[player_name].max_enc_dps = data.Combatant[player_name].max_enc_dps || 0;

			if (can_calculate_max && (!current_state || !current_state.internal.game.Combatant || !current_state.internal.game.Combatant[player_name] || +data.Combatant[player_name].encdps > current_state.internal.game.Combatant[player_name].max_enc_dps)) {
				data.Combatant[player_name].max_enc_dps = +data.Combatant[player_name].encdps;
			} else if (current_state && current_state.internal.game.Combatant && current_state.internal.game.Combatant[player_name]) {
				data.Combatant[player_name].max_enc_dps = current_state.internal.game.Combatant[player_name].max_enc_dps || 0;
			}
		}

		return data;
	}

	normalizeAggroList(data) {
		for (let key of ["CurrentHP", "MaxHP"]) {
			for (let i in data.AggroList) {
				if (data.AggroList[i][key] !== undefined) {
					data.AggroList[i][key] = this.normalizeFieldLocale(data.AggroList[i][key]);
				}
			}
		}

		return data.AggroList;
	}

	appendHistory(data, state) {
		if (!data.Encounter) {
			return;
		}

		const interval = 15;

		let current_history = state.internal.encounter_history[0].data_history;
		let recent_time     = Object.keys(current_history).slice(-1)[0];
		let current_time    = Math.round(new Date().getTime() / 1000);

		if (recent_time && (current_time - recent_time) < interval) {
			return;
		}

		let new_data  = {};
		let encounter = JSON.parse(JSON.stringify(data.Encounter));

		new_data["Encounter"] = {
			encdps : PlayerProcessor.getDataValue("encdps", encounter, undefined, undefined, true),
			enchps : PlayerProcessor.getDataValue("enchps", encounter, undefined, undefined, true),
			enctps : PlayerProcessor.getDataValue("enctps", encounter, undefined, encounter, true)
		};

		for (let player_name in data.Combatant) {
			let player = JSON.parse(JSON.stringify(data.Combatant[player_name]));

			new_data[player_name] = {
				encdps : PlayerProcessor.getDataValue("encdps", player, undefined, undefined, true),
				enchps : PlayerProcessor.getDataValue("enchps", player, undefined, undefined, true),
				enctps : PlayerProcessor.getDataValue("enctps", player, undefined, encounter, true)
			};
		}

		current_history[current_time] = new_data;

		state.internal.encounter_history[0].data_history = current_history;
	}

	processEnmity(data) {
		for (let i in data.Entries) {
			data.Entries[i].name = data.Entries[i].Name;
		}

		let sorted_players = PlayerProcessor.sortPlayers(data.Entries, undefined, "Enmity");
		let max_value      = 0;
		let players        = {};

		for (let player of sorted_players) {
			if (!max_value) {
				max_value = player.Enmity || 100;
			}

			let percent = ((player.Enmity / max_value) * 100).toFixed(2);

			players[player.Name] = percent;
		}

		return players;
	}

	injectEnmity(data, state) {
		for (let player_name in data.Combatant) {
			let real_player_name = player_name;

			if (player_name === "YOU") {
				player_name = PlayerProcessor.getDataValue("name", data.Combatant[player_name], undefined, undefined, undefined, state);
			}

			data.Combatant[real_player_name].enmity_percent = state.internal.enmity[player_name] || 0;
		}

		return data;
	}

	processParty(data) {
		let party = [];

		if (!data || !data.party) {
			return party;
		}

		for (let i in data.party) {
			if (data.party[i].inParty) {
				party.push(data.party[i].name);
			}
		}

		return party;
	}

	convertToLocaleFormat(key, value) {
		const state = store.getState();

		let accuracy          = state.settings.interface.decimal_accuracy;
		let shorten_thousands = state.settings.interface.shorten_thousands;
		let over_thousand     = false;
		let fraction_rules    = Constants.PlayerMetricFractionRules[key];
		let minimum_fraction  = (fraction_rules && fraction_rules.hasOwnProperty("min")) ? fraction_rules.min : accuracy;
		let maximum_fraction  = (fraction_rules && fraction_rules.hasOwnProperty("max")) ? fraction_rules.max : accuracy;
		
		value = +value;

		if (shorten_thousands && value >= 1000) {
			value         = +(value / 1000).toFixed(2);
			over_thousand = true;
		}

		value = value.toLocaleString(undefined, { minimumFractionDigits : minimum_fraction, maximumFractionDigits: maximum_fraction });

		if (over_thousand) {
			value += "K";
		}

		return value;
	}

	processCombatDataTTS(data, current_state) {
		let valid_player_names = PlayerProcessor.getValidPlayerNames(current_state);

		if (data.Combatant) {
			TTSService.updateCombatants(data.Combatant, valid_player_names);
		}

		TTSService.processEncounter(data, current_state);

		if (!data.Encounter) {
			return;
		}

		if (UsageService.usingTopDPSTTS(current_state.settings_data)) {
			let sorted = PlayerProcessor.sortPlayers(data.Combatant, data.Encounter, "encdps", current_state);
			let rank   = 0;

			for (let player of sorted) {
				rank++;

				if (valid_player_names.indexOf(player.name) !== -1) {
					TTSService.processRank(rank, "dps", current_state);
					break;
				}
			}
		}

		if (UsageService.usingTopHPSTTS(current_state.settings_data)) {
			let sorted = PlayerProcessor.sortPlayers(data.Combatant, data.Encounter, "enchps", current_state);
			let rank   = 0;

			for (let player of sorted) {
				rank++;

				if (valid_player_names.indexOf(player.name) !== -1) {
					TTSService.processRank(rank, "hps", current_state);
					break;
				}
			}
		}

		if (UsageService.usingTopTPSTTS(current_state.settings_data)) {
			let sorted = PlayerProcessor.sortPlayers(data.Combatant, data.Encounter, "enctps", current_state);
			let rank   = 0;

			for (let player of sorted) {
				rank++;

				if (valid_player_names.indexOf(player.name) !== -1) {
					TTSService.processRank(rank, "tps", current_state);
					break;
				}
			}
		}
	}

	processAggroTTS(data, current_state) {
		if (UsageService.usingAggroTTS(current_state.settings_data)) {
			TTSService.processAggro(data);
		}
	}

	parseSpellLogLine(data, state, processed_state) {
		data = data.line;

		let date       = new Date();
		let event_code = +data[0];
		let log_data   = {
			suffix : ""
		};

		switch (event_code) {
			case 3:
				log_data.char_id = parseInt(data[2], 16);

				if (log_data.char_id !== state.internal.character_id) {
					return false;
				}

				log_data.char_job   = Constants.GameJobsID[parseInt(data[4], 16)] || null;
				log_data.char_level = parseInt(data[5], 16);

				return log_data;

			case 21:
			case 22:
				log_data.spell_index      = 4;
				log_data.char_id_index    = 2;
				log_data.spell_name_index = 5;
				log_data.char_name_index  = log_data.char_id_index + 1;
				log_data.type             = "skill";
				log_data.subtype          = log_data.type;
				log_data.lookup_key       = "spells";

				break;

			case 25:
				log_data.char_id = parseInt(data[2], 16);

				if (log_data.char_id !== state.internal.character_id) {
					return false;
				}

				// return "death";
				return false;

			case 26:
			case 30:
				log_data.spell_index = 2;

				let effect_id = String(parseInt(data[log_data.spell_index], 16));

				if (!SkillData.Effects[effect_id]) {
					return false;
				}

				log_data.type             = "effect";
				log_data.dot              = SkillData.Effects[effect_id].dot;
				log_data.debuff           = SkillData.Effects[effect_id].debuff;
				log_data.subtype          = (log_data.dot)
					? "dot"
					: ((log_data.debuff)
						? "debuff"
						: log_data.type);
				log_data.lookup_key       = log_data.subtype + "s";
				log_data.char_id_index    = (log_data.dot || log_data.debuff) ? 5 : 7;
				log_data.char_name_index  = log_data.char_id_index + 1;
				log_data.spell_name_index = 3;
				log_data.duration_index   = 4;
				log_data.stacks           = +data[9];

				break;

			case 33:
				return (data[3] === "40000005") ? "wipe" : false;

			default:
				return false;
		}

		log_data.spell_id  = String(parseInt(data[log_data.spell_index], 16));
		log_data.char_id   = parseInt(data[log_data.char_id_index], 16);
		log_data.char_type = (state.internal.character_id === log_data.char_id) ? "you" : false;
		log_data.party     = (log_data.char_type !== "you");

		if (
			log_data.party &&
			state.settings.spells_mode.party_zones.length &&
			state.settings.spells_mode.party_zones.indexOf(String(state.internal.current_zone_id)) === -1
		) {
			return false;
		}

		if (!log_data.char_type) {
			log_data.char_name = data[log_data.char_name_index];

			if (!state.internal.game.Combatant || !state.internal.game.Combatant[log_data.char_name]) {
				return false;
			}

			log_data.job = (state.internal.game.Combatant[log_data.char_name].Job || "").toUpperCase();

			if (!Constants.GameJobs[log_data.job]) {
				return false;
			}

			log_data.char_type  = (state.settings.spells_mode.ui.use) ? Constants.GameJobs[log_data.job].role : "party";
			log_data.lookup_key = "party_" + log_data.lookup_key;
			log_data.suffix     = "party";
		}

		if (
			!state.internal.spells.allowed_types[log_data.subtype][log_data.char_type] &&
			!state.internal.spells.allowed_types[log_data.subtype][log_data.job]
		) {
			return false;
		}

		if (log_data.type === "effect") {
			log_data.english_name = LocalizationService.getSpellName(log_data.subtype, log_data.spell_id, "en");

			if (!SpellService.isValidName(log_data.lookup_key, log_data.english_name)) {
				return false;
			}
		} else {
			if (state.settings.spells_mode[log_data.lookup_key].indexOf(log_data.spell_id) === -1) {
				if (this.isValidIndirection(log_data)) {
					return this.processIndirection(log_data, data, state);
				}

				return false;
			}

			log_data.english_name = LocalizationService.getSpellName(log_data.subtype, log_data.spell_id, "en");
		}

		let state_data    = processed_state || clone(state.internal.spells);
		let defaulted_key = `${log_data.subtype}-` + SpellService.getKeyName(log_data.english_name);
		let suffixes      = [];

		if (!log_data.party) {
			suffixes.push("");
		} else {
			if (state.internal.spells.allowed_types[log_data.subtype][log_data.char_type]) {
				suffixes.push(log_data.char_type);
			}

			if (state.settings.spells_mode.ui.use && state.internal.spells.allowed_types[log_data.subtype][log_data.job]) {
				suffixes.push(log_data.job);
			}
		}

		log_data.in_use_key = (log_data.type === "effect")
			? `${log_data.type}-` + SpellService.getKeyName(log_data.english_name)
			: `${log_data.type}-${log_data.spell_id}`;

		if (!log_data.party && state_data.defaulted[defaulted_key]) {
			let defaulted = state_data.defaulted[defaulted_key];

			log_data.defaulted     = true;
			log_data.type_position = defaulted.position;

			if (defaulted.id !== log_data.spell_id) {
				if (event_code === 30) {
					state_data.in_use[log_data.in_use_key] = clone(state_data.in_use[defaulted.key]);

					state_data.in_use[log_data.in_use_key].spell_id = log_data.spell_id;
					state_data.in_use[log_data.in_use_key].duration = 0;
				}

				delete state_data.in_use[defaulted.key];

				state_data.defaulted[defaulted_key].id  = log_data.spell_id;
				state_data.defaulted[defaulted_key].key = log_data.in_use_key;

				if (event_code === 30) {
					return state_data;
				}
			}
		}

		for (let suffix of suffixes) {
			log_data.current_in_use_key = log_data.in_use_key;

			if (suffix) {
				log_data.current_in_use_key += `-${suffix}`;

				if (suffix !== "party") {
					log_data.char_type = suffix;
				}
			}

			if (event_code === 30) {
				delete state_data.in_use[log_data.current_in_use_key];
			} else {
				if (state_data.in_use[log_data.current_in_use_key] && +state_data.in_use[log_data.current_in_use_key].stacks > log_data.stacks) {
					return false;
				}

				state_data.in_use[log_data.current_in_use_key] = {
					type          : log_data.type,
					subtype       : log_data.subtype,
					id            : log_data.spell_id,
					time          : date,
					name          : data[log_data.spell_name_index],
					duration      : (log_data.duration_index) ? +data[log_data.duration_index] : 0,
					stacks        : log_data.stacks,
					log_type      : log_data.char_type + "-" + log_data.subtype,
					party         : log_data.party,
					defaulted     : log_data.defaulted,
					type_position : log_data.type_position
				};
			}
		}

		if (this.isValidIndirection(log_data)) {
			return this.processIndirection(log_data, data, state, state_data);
		}

		return state_data;
	}

	isValidIndirection(log_data) {
		return (log_data.type === "skill" && SkillData.SkillIndirections[log_data.spell_id]);
	}

	processIndirection(log_data, data, state, processed_state) {
		let indirect_id = SkillData.SkillIndirections[log_data.spell_id];

		data[log_data.spell_index]      = indirect_id.toString(16);
		data[log_data.spell_name_index] = null;

		return this.parseSpellLogLine({line : data}, state, processed_state);
	}

	getAllowedSpellTypes(state) {
		let types = {
			skill  : {
				you   : true,
				party : true
			},
			effect : {
				you   : true,
				party : true
			},
			dot    : {
				you   : true,
				party : true
			},
			debuff : {
				you   : true,
				party : true
			}
		};

		if (state.settings.spells_mode.ui.use) {
			types.skill.you    = false;
			types.effect.you   = false;
			types.dot.you      = false;
			types.debuff.you   = false;
			types.skill.party  = false;
			types.effect.party = false;
			types.debuff.party = false;

			for (let uuid in state.settings.spells_mode.ui.sections) {
				let section = state.settings.spells_mode.ui.sections[uuid];

				for (let type of section.types) {
					let data = type.split("-");

					types[data[1]][data[0]] = true;
				}
			}
		}

		return types;
	}
}

export default new GameDataProcessor();