'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _helpers = require('../../node_modules/ava-ia/lib/helpers');

exports.default = function (state) {

	return new Promise(function (resolve, reject) {
		var match, command, periph, answer, macro;
		var periphs = Config.modules.eeDomus.intentRules;

		for (var i=0; i<periphs.length && !match; i++) {
			 for (var rule in Config.modules.eeDomus[periphs[i]]) {
				 if (rule != 'command' && rule != 'macro' && rule != 'answer') {
					match = (0, _helpers.syntax)(state.sentence, Config.modules.eeDomus[periphs[i]][rule]);
					if (match) {
						periph = periphs[i];
						command = (Config.modules.eeDomus[periphs[i]].command) ? Config.modules.eeDomus[periphs[i]].command : rule;
            answer = (Config.modules.eeDomus[periphs[i]].answer) ? Config.modules.eeDomus[periphs[i]].answer : null;
            macro = (Config.modules.eeDomus[periphs[i]].macro) ? Config.modules.eeDomus[periphs[i]].macro : false;
            break;
					}
				 }
			 }
		}

		var room = Avatar.ia.clientFromRule (state.rawSentence);

		setTimeout(function(){
			if (match && rule) {
				if (state.debug) info('ActionEEDomus', 'action:', command);
				state.action = {
					module: 'eeDomus',
					command: command,
					periph: periph,
					value: rule,
					room: room,
          answer: answer,
          macro: macro,
					tts: false
				};
			}

			resolve(state);
		}, 500);
	});
};
