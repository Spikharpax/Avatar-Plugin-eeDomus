'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _helpers = require('../../node_modules/ava-ia/lib/helpers');

var _ = require('underscore');

exports.default = function (state) {
	
	return new Promise(function (resolve, reject) {
		var match, command, periph;
		var periphs = Config.modules.eeDomus.intentRules;
		
		for (var i=0; i<periphs.length && !match; i++) {
			 for (var rule in Config.modules.eeDomus[periphs[i]]) {
				 if (rule != 'command') {
					match = (0, _helpers.syntax)(state.sentence, Config.modules.eeDomus[periphs[i]][rule]); 
					if (match) {
						periph = periphs[i];
						command = (Config.modules.eeDomus[periphs[i]].command) ? Config.modules.eeDomus[periphs[i]].command : rule;
						break;
					}
				 }
			 }
		}
		
		var room = Avatar.ia.clientFromRule (state.rawSentence);
		
		setTimeout(function(){ 			
			if (match && rule) {
					
				if (state.debug) info('ActionEEDomus'.bold.yellow, 'action:', command.yellow);
				
				state.action = {
					module: 'eeDomus',
					command: command,
					periph: periph,
					value: rule,
					room: room,
					tts: false		
				};
			}		
				
			resolve(state);	
		}, 500);
	});
};
