var request = require('request');
var _ = require('underscore');
var CronJob = require('cron').CronJob;

require('colors');

exports.init = function(){

	// table of properties
	 _eeDomusConf = {
		eeIp: Config.modules.eeDomus.ip || '',
		eeUser: Config.modules.eeDomus.user || '',
		eeSecret : Config.modules.eeDomus.secret || ''
	};

}



exports.action = function(data, callback){

	if (!_eeDomusConf.eeIp || !_eeDomusConf.eeUser || !_eeDomusConf.eeSecret) {
		error("eeDomus", "La configuration de la box domotique est manquante".red);
		return callback();
	}

	var room;
	var tblCommand = {
		set: function(){
				Avatar.speak(Config.modules.eeDomus.answers, data.client, function() {
					setEECommand(Config.modules.eeDomus.clients[room][data.action.periph], data.action.value);
					Avatar.Speech.end(data.client);
				});
		},
		switchLight : function() {
			switchLight(data.client, room, data.action.value, Config.modules.eeDomus.clients[room]['lightDimmer']);
		}
	};

	info("eeDomus command:", data.action.command.yellow, "From:", data.client.yellow);

	if (data.action.room && data.action.room != 'current')
		room = data.action.room;
	else {
		if (Avatar.isMobile(data.client))
			room = Avatar.currentRoom ? Avatar.currentRoom : Config.default.client;
		else
			room = data.client;
	}

	tblCommand[data.action.command]();
	callback();
}




function switchLight (client, room, value, periphID) {

	// Allumé/Eteint ?
	getEECommand (periphID, function(text,state) {
		switch (text) {
			case 'error':
				Avatar.Speech.end(client);
				error('l\'action EEDomus a échouée'.red);
				break;
			case 'Off':
				if (value == '100') { // j'allume
					info('j\'allume la lumière dans la pièce',room);
					setEECommand(periphID, value);
					Avatar.speak(Config.modules.eeDomus.answers, client, function() {
						Avatar.Speech.end(client);
					});
				} else {
					Avatar.speak('la lumière est déjà éteinte', client, function() {
						Avatar.Speech.end(client);
					});
					info('la lumière est déjà éteinte dans la pièce',room);
				}
				break;
			case 'On':	 // j'éteins
				if (value == '0') {
					info('j\'éteins la lumière dans la pièce',room);
					setEECommand(periphID, value);
					Avatar.speak(Config.modules.eeDomus.answers, client, function() {
						Avatar.Speech.end(client);
					});
				} else {
					Avatar.speak('la lumière est déjà allumée', client, function() {
						Avatar.Speech.end(client);
					});
					info('la lumière est déjà allumée dans la pièce',room);
				}
				break;
		}
	});

}




function getEECommand (periphID, callback){

    if (typeof periphID !== 'string') periphID = periphID[0];

	// Build URL api.eedomus.com
	var url = 'http://api.eedomus.com/get?action=periph.caract';
	url += '&api_user='+_eeDomusConf.eeUser;
	url += '&api_secret='+_eeDomusConf.eeSecret;
	url += '&periph_id='+periphID;

	// Send Request
	request({ 'uri': url, 'json': true }, function (err, response, json){
		if (err || response.statusCode != 200) {
		  return error('l\'action get EEDomus a échouée'.red);
		}
		json = json.body;
		var text = (json && json.last_value_text) ? json.last_value_text : 'error';
		var value = (json && json.last_value) ? json.last_value : 'error';
		callback(text,value);

	});

}



function setEECommand (periphID, value, callback) {

	if (!periphID || !value)
		return error("eeDomus", "Les valeurs pour realiser l'action sont manquantes.".red);

	if (typeof periphID === 'string') {
		setCommand (periphID, value, callback);
	} else {
		for (var i in periphID) {
			setCommand (periphID[i], value);
		}
		if (callback) callback();
	}

}



function setCommand (periphID, value, callback) {


	info("eeDomus", "periphID:", periphID.yellow, "value:", value.yellow);

	var url = 'http://'+_eeDomusConf.eeIp+'/set?action=periph.value';
	url += '&periph_id='+periphID+'&value='+value+'&api_user='+_eeDomusConf.eeUser+'&api_secret='+_eeDomusConf.eeSecret;

	request({ 'uri': url, 'json': true }, function (err, response, json){
		if (err || response.statusCode != 200)
			return error("eeDomus", "L'action eeDomus a échouée".red);

		if (callback) callback();
	});

}
