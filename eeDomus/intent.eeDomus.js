'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _helpers = require('../../node_modules/ava-ia/lib/helpers');

exports.default = function (state, actions) {

	if (state.isIntent || state.client == 'TranslateByInterface') return (0, _helpers.resolve)(state);

	var match;
	var periphs = Config.modules.eeDomus.intentRules;

	for (var i=0; i<periphs.length && !match; i++) {
		 for (var rule in Config.modules.eeDomus[periphs[i]]) {
			 if (rule != 'command' && rule != 'macro' && rule != 'answer') {
				match = (0, _helpers.syntax)(state.sentence, Config.modules.eeDomus[periphs[i]][rule]);
				if (match)
					break;
			 }
		 }
	}

	if (match && rule) {
		state.isIntent = true;
		return (0, _helpers.factoryActions)(state, actions);
	} else
		return (0, _helpers.resolve)(state);

};
