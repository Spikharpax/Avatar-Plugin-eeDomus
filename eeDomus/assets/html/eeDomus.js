const {ipcRenderer, remote} = require('electron');
const {dialog, BrowserWindow} = remote;
const fs = require('fs-extra');
const _ = require('underscore');
const  $ = require('jquery');
const jstree = require ('jstree');
const path = require ('path');
let _eeDomusConf;
let EEDomusLib;
let Config;
let last_selected_item_action_value;
let usage_type_mapping = {};

let value_type = {
  'list': 'Liste de valeurs',
  'float': 'Valeur flotante',
  'string': 'Valeur entière'
}

let msg = {
  no_periph_selected : "Aucun périphérique sélectionné. Une sauvegarde des paramètres modifiera la configuration par défaut.",
  widget_with_style : "Le périphérique sélectionné à un widget associé et un style personnalisé. Un test ou une sauvegarde des paramètres modifiera uniquement ce widget. Décochez la case pour un test sur tous les widgets existants ou une sauvegarde de la configuration par défaut.",
  widget_no_style : "Le périphérique sélectionné à un widget associé mais pas de style personnalisé. Cochez la case pour un test ou une sauvegarde uniquement sur celui-çi sinon l'action sera effectuée pour tous les widgets existants et pour la configuration par défaut.",
  periph_no_widget : "Le périphérique sélectionné n'a pas de widget associé. Si vous faites un test ou une sauvegarde, l'action sera effectuée pour tous les widgets existants et pour la configuration par défaut.",
  rule_exist : "Un groupe de règles existe déjà pour ce périphérique dans cette pièce. Vous pouvez ajouter d'autres règles si vous le désirez.",
  rule_exist_other_room : "Il existe déjà un groupe de règles créées dans une autre pièce pour un périphérique avec le même nom. Si les règles sont les mêmes, vous pouvez les utiliser ou vous pouvez aussi créer un groupe de règles différentes uniquement pour ce périphérique.",
  no_rule : "Aucunes règles définies pour ce périphérique.",
  actions_exist_for_periph_get: "Règles associées pour ce périphérique:",
  actions_exist_for_periph_set: "Règles associées à la valeur:",
  actions_not_exist_for_periph_get: "Règles associées <b>pour le périphérique dans l'autre pîèce</b>. Cliquez sur <b>'SAUVEGARDER'</b> pour les associer à ce périphérique:",
  actions_not_exist_for_periph_set : "Règles associées <b>pour le périphérique dans l'autre pîèce</b>. Cliquez sur <b>'SAUVEGARDER'</b> pour les associer à ce périphérique:"
}

let value_list = [];

// les périphériques eeDomus
let periphInfos;
// Les Widgets existantes
let existingWidgets;
let selected_periph_data;
let config_widget_save;

window.onbeforeunload = (e) => {
  e.preventDefault();
  close();
}



function close() {
  let state = ipcRenderer.sendSync('eeDomus', 'quit');
}


document.getElementById('exit').addEventListener('click', function(){
    close();
});
document.getElementById('exit-settings').addEventListener('click', function(){
    close();
});
document.getElementById('exit-image').addEventListener('click', function(){
    close();
});
document.getElementById('exit-rules').addEventListener('click', function(){
    close();
});

document.getElementById('save-rules').addEventListener('click', function(){

  if (document.getElementById('new-rule').toggled == true && document.getElementById("add-function").value == '') {
    let item = selected_periph_data.instance.get_selected(true)[0];
    getPeriphByName(item.text, item.parent)
    .then(infos => {
      let ID = ipcRenderer.sendSync('geteeDomusID');
      let win = BrowserWindow.fromId(ID);
      let type = (usage_type_mapping[infos.usage_name].action == 'get') ? 'get' : 'set';
      let options = {
        type: "info",
        title: "Information",
        buttons: ["Oui, Sauvegarder", "Annuler"],
        message: "Aucune fonction JavaScript associée.",
        detail: 'La fonction JavaScript pour ces règles sera définie comme la fonction standard "'+type+'" et aucune fonction ne sera ajoutée dans le module action() du fichier eeDomus.js.'
      };
      dialog.showMessageBox(win, options, function (response) {
        if (response == 1) return;
          document.getElementById('add-function').value = type;
          save_rule();
      })
    })
  } else {
    save_rule();
  }
});


function reformat (str){
    var accent = [
        /[\300-\306]/g, /[\340-\346]/g, // A, a
        /[\310-\313]/g, /[\350-\353]/g, // E, e
        /[\314-\317]/g, /[\354-\357]/g, // I, i
        /[\322-\330]/g, /[\362-\370]/g, // O, o
        /[\331-\334]/g, /[\371-\374]/g, // U, u
        /[\321]/g, /[\361]/g, // N, n
        /[\307]/g, /[\347]/g
    ];
    var noaccent = ['A','a','E','e','I','i','O','o','U','u','N','n','C','c'];
    for(var i = 0; i < accent.length; i++){
        str = str.replace(accent[i], noaccent[i]);
    }

    return str;
}


document.getElementById('new-rule').addEventListener('click', function(){

    document.getElementById('set-or-macro').style.visibility = "hidden";

    let periph = selected_periph_data.instance.get_selected(true)[0];
    getPeriphByName(periph.text, periph.parent)
    .then(infos => {
      document.getElementById('label-add-function').style.visibility = "visible";
      document.getElementById('add-function').style.visibility = "visible";

      let type = (usage_type_mapping[infos.usage_name].action == 'get') ? 'get' : 'set';
      document.getElementById('add-function').value = type+reformat(periph.text.replace(/ /g,''));

      document.getElementById("rules-to-add").value = '';
      if (document.getElementById("x-select-action").style.visibility == "hidden") {
        document.getElementById('step-2-infos-actions').className = "label-min step-2-infos-actions-get-exist";
        document.getElementById("step-2-infos-actions").innerHTML = msg.actions_exist_for_periph_get;
      } else {
        document.getElementById('x-select-action').disabled = true;
        document.getElementById('step-2-infos-actions').className = "label-min step-2-infos-actions-set-exist";
        document.getElementById("step-2-infos-actions").innerHTML = msg.actions_exist_for_periph_set;
      }
    })
});


document.getElementById('same-rule').addEventListener('click', function(){
    document.getElementById('set-or-macro').style.visibility = "visible";
    document.getElementById('label-add-function').style.visibility = "hidden";
    document.getElementById('add-function').value = '';
    document.getElementById('add-function').style.visibility = "hidden";

    if (document.getElementById("x-select-action").style.visibility == "hidden") {
      document.getElementById('step-2-infos-actions').className = "label-min step-2-infos-actions-get";
      document.getElementById("step-2-infos-actions").innerHTML = msg.actions_not_exist_for_periph_get;
    } else {
      document.getElementById('x-select-action').disabled = false;
      document.getElementById('step-2-infos-actions').className = "label-min step-2-infos-actions-set";
      document.getElementById("step-2-infos-actions").innerHTML = msg.actions_not_exist_for_periph_set;
    }
    let item = selected_periph_data.instance.get_selected(true)[0];
    let room = item.parent;
    getPeriphByName(item.text, room)
    .then(infos => {
      let name = (_.contains(_.keys(Config), infos.name.replace(/ /g,'')))
              ? infos.name.replace(/ /g,'')
              : infos.name.replace(" "+room,'').replace(" "+room,'').replace(" "+room,'').replace(/ /g,'');

      switch (usage_type_mapping[infos.usage_name].action) {
      case "get":
        if (_.contains(_.keys(Config), name))
          document.getElementById('rules-to-add').value = Config[name].rules;
        break;
      case "set":
        let child;
        let values = document.getElementById('x-menu-action');
        for(let i=0; i < values.childNodes.length;i++) {
            child = values.childNodes[i];
            if (child.toggled) {
              break;
            }
        }
        if (_.contains(_.keys(Config), name) && _.contains(_.keys(Config[name]), child.value)) {
            document.getElementById('rules-to-add').value = Config[name][child.value];
        }
      }
    })
});


document.getElementById('delete-image').addEventListener('click', function(){
  delete_image();
});

document.getElementById('create_widget').addEventListener('click', function(){
  createWidget();
});

document.getElementById('delete_widget').addEventListener('click', function(){
  confirm_deleteWidget(false);
});

document.getElementById('delete_all_widgets').addEventListener('click', function(){
  confirm_deleteWidget(true);
});

document.getElementById('widget').addEventListener('click', function(){
    setTab ('widget');
});

document.getElementById('settings').addEventListener('click', function(){
    setTab ('settings');
});

document.getElementById('icon').addEventListener('click', function(){
    setTab ('icon');
});

document.getElementById('rules').addEventListener('click', function(){
    setTab ('rules');
});

document.getElementById('add-translate').addEventListener('click', function(){

  let translated_rule = document.getElementById("translated-rule");
  let rules = document.getElementById("rules-to-add");

  if (translated_rule.value && rules.value.indexOf(translated_rule.value) == -1) {

    if (is_already_used_rule (translated_rule.value)) {
      let notification = document.getElementById('notification');
      notification.innerHTML = "Cette règle est déjà utilisée dans cette pièce pour un autre périphérique.";
      notification.opened = true;
      return;
    }

    let tblrules = rules.value.join('|');
    tblrules = (tblrules.length > 0) ? tblrules+'|'+translated_rule.value : translated_rule.value;
    rules.value = tblrules.split('|');

    document.getElementById("translated-rule").value = "";
    document.getElementById("translate-rule").value = "";

    document.getElementById("save-rules").disabled = false;
  }

})


function is_already_used_rule (tested_rule) {

  let room = selected_periph_data.instance.get_selected(true)[0].parent;
  let keys = _.keys(Config.clients[room]);
  for (let key in keys) {
    for (let rule in Config[keys[key]]) {
      if (rule != 'command' && rule != 'answer') {
        for (let a=0; a<Config[keys[key]][rule].length; a++) {
          if (Config[keys[key]][rule][a].replace(/ \* /g,' ') == tested_rule) {
             return true;
           }
        }
        if (_.contains(Config[keys[key]][rule], tested_rule)) {
           return true;
         }
      }
    }
  }

  return false;
}


document.getElementById('do-translate').addEventListener('click', function(){

  if (document.getElementById("translate-rule").value) {
    let state = ipcRenderer.sendSync('manage_eeDomus_node', {action: 'translate', text: document.getElementById("translate-rule").value});
    if (state) {
      if (!state.terms) {
          let notification = document.getElementById('notification');
          notification.innerHTML = "Cette phrase est déjà une règle. Vous ne pouvez pas l'utiliser.";
          notification.opened = true;
          return;
      }

      if (state.translated.from.text.autoCorrected) {
        state.translated.from.text.value = state.translated.from.text.value.replace(/\[/g,'').replace(/\]/g,'');
        document.getElementById("translate-rule").value = state.translated.from.text.value;
      }
      testRule(state.terms);
    } else {
      let notification = document.getElementById('notification');
      notification.innerHTML = "Une erreur est survenue, impossible de traduire la phrase";
      notification.opened = true;
      return;
    }
  }

})


function testRule (terms) {

  let ignored = ["Adverb","Date","Modal","Person","Determiner","Verb","Expression","Pronoun","Preposition","Conjunction","Possessive","Value"];
  let added = ["?","Question","Actor","Infinitive","PastTense","PresentTense","FutureTense","Adjective","Noun","Organization","Country"];
  let rule;
  let term;
  for (i in terms) {
    if (terms[i].text && terms[i].text.length > 0)
      term = terms[i].text;
    if (terms[i].normal)
      term = terms[i].normal;
    if (terms[i].expansion)
      term = terms[i].expansion;
    if (terms[i].pos && (terms[i].pos.Plural || (terms[i].pos.Verb && terms[i].pos.PresentTense)) && term[term.length -1] == 's') {
      term = term.substring(0, term.length - 1);
    }

    let tag;
    if (terms[i].tag)
      tag = terms[i].tag;
    if (!tag && terms[i].pos && terms[i].pos.Verb)
      tag = 'Verb';

    if (rule && _.indexOf(ignored,tag) != -1 && i > 0 && i < terms.length - 1) {
      if (rule[rule.length - 1] != '*')
          rule += " *";
    } else if (_.indexOf(added,tag) != -1 && i == 0) {
        rule = term;
    } else if (_.indexOf(added,tag) != -1 && i > 0) {
        rule = (rule) ? rule + " " + term : term;
    } else if (rule && rule[rule.length - 1] != '*' && i < terms.length - 1) {
        rule += " *";
    } else if (!rule && _.indexOf(ignored,tag) != -1 && terms.length == 1) {
        rule = term;
    }
  }

  if (rule) {
    if (rule[rule.length - 1] == '*')
      rule = rule.substring(0, rule.length - 2);
    document.getElementById("translated-rule").value = rule;
  }
}



function setparam(param, element, suffix, float) {
  param = param.split('.');
  if (selected_periph_data) {
      isAlreadyExist(selected_periph_data.instance.get_selected(true)[0].id)
      .then(isExist => {
         let config = (!isExist || (isExist && !isExist.style)) ? Config.widget : isExist.style;
         if (param.length == 1) {
            config[param[0]] = document.getElementById(element).value+(suffix ? "px" : '');
            if (float) config[param[0]] = parseFloat(config[param[0]]);
         } else
            config[param[0]][param[1]] = document.getElementById(element).value+(suffix ? "px" : '');
       })
  } else {
    if (param.length == 1) {
      Config.widget[param[0]] = document.getElementById(element).value+(suffix ? "px" : '');
      if (float) Config.widget[param[0]] = parseFloat(Config.widget[param[0]]);
    } else
      Config.widget[param[0]][param[1]] = document.getElementById(element).value+(suffix ? "px" : '');
  }
}


function getNewImage (elem, state) {

  let options = {
    title: "Sélection de l'image pour l'état " + state,
    //defaultPath: path.normalize (__dirname + '/images/rooms'),
    filters: [
      { name: 'Images',
        extensions: ['png']
      }
    ],
    properties: ['openFile']
  };

  let ID = ipcRenderer.sendSync('geteeDomusID');
  let win = BrowserWindow.fromId(ID);
  dialog.showOpenDialog(win, options, function (file) {
    if(file && file.length > 0) {
      let options = {
        type: "question",
        title: "Type de sauvegarde",
        buttons: ["Globale pour l'usage", "Personnalisée pour le périphérique", "Annuler"],
        detail: "Choisissez si l'image du widget est définie pour tous les périphériques avec le même usage ou uniquement pour le périphérique sélectionné."
      };
      dialog.showMessageBox(win, options, function (response) {
        if (response == 2) return;
        setNewImage(elem, state, file[0], response)
      })
    }
  });

}

document.getElementById('icon1-widget').addEventListener('click', function(){
    let state = (document.getElementById('label-icon1-widget').innerHTML == "Autre") ? "Other" : document.getElementById('label-icon1-widget').innerHTML;
    getNewImage("icon1-widget", state)
})

document.getElementById('icon2-widget').addEventListener('click', function(){
  let state = (document.getElementById('label-icon2-widget').innerHTML == "Autre") ? "Other" : document.getElementById('label-icon2-widget').innerHTML;
  getNewImage("icon2-widget", state)
})

document.getElementById('icon3-widget').addEventListener('click', function(){
  let state = (document.getElementById('label-icon3-widget').innerHTML == "Autre") ? "Other" : document.getElementById('label-icon3-widget').innerHTML;
  getNewImage("icon3-widget", state)
})

document.getElementById('widget-color-picker').addEventListener('click', function(){
  setparam('color', 'widget-color-picker');
})

document.getElementById('widget-text-color-picker').addEventListener('click', function(){
  setparam('textColor', 'widget-text-color-picker');
})

document.getElementById('opacity-widget').addEventListener('click', function(){
  setparam('opacity', 'opacity-widget', null, true);
})

document.getElementById('padding-widget').addEventListener('click', function(){
  setparam('padding', 'padding-widget', 'px');
})

document.getElementById('font-size-title').addEventListener('click', function(){
  setparam('font.title', 'font-size-title', 'px');
})
document.getElementById('font-size-value').addEventListener('click', function(){
  setparam('font.value', 'font-size-value', 'px');
})

document.getElementById('font-size-status').addEventListener('click', function(){
  setparam('font.status', 'font-size-status', 'px');
})

let valuePadding = 0;
document.getElementById('padding-value').addEventListener('click', function(){
  valuePadding = parseInt(document.getElementById('padding-value').value);
})
let imagePadding = 0;
document.getElementById('size-widget').addEventListener('click', function(){
  imagePadding = parseInt(document.getElementById('size-widget').value);
})


document.getElementById('checkbox-selected-widget').addEventListener('click', function(){
    if (selected_periph_data && document.getElementById('checkbox-selected-widget').toggled) {
        isAlreadyExist(selected_periph_data.instance.get_selected(true)[0].id)
        .then(isExist => {
              if (!isExist || (isExist && !isExist.style))
                Config.widget.id = selected_periph_data.instance.get_selected(true)[0].id;
              if (!isExist)
                document.getElementById('label-selected-widget').innerHTML= msg.periph_no_widget;
              if (isExist && !isExist.style)
                document.getElementById('label-selected-widget').innerHTML= msg.widget_no_style;
              if (isExist && isExist.style)
                document.getElementById('label-selected-widget').innerHTML= msg.widget_with_style;
         })
    }
})



document.getElementById('testing_widget').addEventListener('click', function(){

  if (existingWidgets.length == 0) {
    let notification = document.getElementById('notification');
    notification.innerHTML = "Pour tester vos paramètres, créez d'abord un widget!";
    notification.opened = true;
    return;
  }

  if (selected_periph_data && document.getElementById('checkbox-selected-widget').toggled) {
      isAlreadyExist(selected_periph_data.instance.get_selected(true)[0].id)
      .then(isExist => {
        if (!isExist || (isExist && !isExist.style)) {
          Config.widget.id = selected_periph_data.instance.get_selected(true)[0].id;
          doTest(Config.widget);
        } else {
          isExist.style.id = selected_periph_data.instance.get_selected(true)[0].id;
          doTest(isExist.style);
        }
      })
  } else {
    Config.widget.id = null;
    doTest(Config.widget);
  }

})


function doTest(config) {

  let status = ipcRenderer.sendSync('manage_eeDomus_node',
      {
        action: 'test',
        classname: 'eeDomusWidget',
        style: config,
        padding: {image: imagePadding, value: valuePadding}
      }
  );

  if (status) {
    isAlreadyExist(selected_periph_data.instance.get_selected(true)[0].id)
    .then(isExist => {
        if (isExist && !isExist.style && document.getElementById('checkbox-selected-widget').toggled)
          isExist.style = Config.widget;

          // notif de sauvegarde
          let notification = document.getElementById('notification');
          notification.innerHTML = "Configuration testée, si elle vous convient, vous pouvez la sauvegarder.";
          notification.opened = true;
     })
  } else {
    // notif de sauvegarde
    let notification = document.getElementById('notification');
    notification.innerHTML = "Erreur, impossible de tester la configuration";
    notification.opened = true;
  }

  document.getElementById('padding-value').value = 0;
  imagePadding = 0;
  document.getElementById('size-widget').value = 0;
  valuePadding = 0;

}


document.getElementById('save-settings').addEventListener('click', function(){

  if (selected_periph_data && document.getElementById('checkbox-selected-widget').toggled) {
      isAlreadyExist(selected_periph_data.instance.get_selected(true)[0].id)
      .then(isExist => {
          if (!isExist || (isExist && !isExist.style)) {
            Config.widget.id = selected_periph_data.instance.get_selected(true)[0].id;
            doSave(Config.widget);
          } else {
            isExist.style.id = selected_periph_data.instance.get_selected(true)[0].id;
            doSave(isExist.style);
          }
       })
  } else {
    Config.widget.id = null;
    confirm_savePropreties();
  }

})


function confirm_savePropreties (list) {

    let id = ipcRenderer.sendSync('info', 'id');
    let win = BrowserWindow.fromId(id);

    let options = {
        type: 'question',
        title: 'Confirmer la sauvegarde',
        message: 'Voulez-vous vraiment modifier la configuration par défaut ?',
        buttons: ['Oui', 'Non']
    };

   remote.dialog.showMessageBox(win, options, function(response) {
        if (response == 0) {
          doSave(Config.widget);
        }
    });
}


function doSave (config) {

  let status = ipcRenderer.sendSync('save_eeDomusConfig',config)

  if (status) {
    let msg_status;
    isAlreadyExist(selected_periph_data.instance.get_selected(true)[0].id)
    .then(isExist => {
        if (document.getElementById('checkbox-selected-widget').toggled) {
          document.getElementById('label-selected-widget').innerHTML = msg.widget_with_style;
          if (isExist && !isExist.style) {
            isExist.style = Config.widget;
          }
          msg_status = "Configuration sauvegardée pour le widget sélectionné !";
        } else {
          msg_status = "Configuration par défaut sauvegardée dans le fichier de prorriétés !";
        }

        // notif de sauvegarde
        let notification = document.getElementById('notification');
        notification.innerHTML = msg_status;
        notification.opened = true;
     })
  } else {
    // notif de sauvegarde
    let notification = document.getElementById('notification');
    notification.innerHTML = "Erreur, impossible de sauvegarder la configuration";
    notification.opened = true;

  }

  document.getElementById('padding-value').value = 0;
  imagePadding = 0;
  document.getElementById('size-widget').value = 0;
  valuePadding = 0;
}


function setTab (tab) {
  document.getElementById("settingsTab").style.display = "none";
  document.getElementById("widgetTab").style.display = "none";
  document.getElementById("iconTab").style.display = "none";
  document.getElementById("rulesTab").style.display = "none";

  let buttonsTab = document.getElementsByClassName("buttonTab");
  for (i = 0; i < buttonsTab.length; i++) {
      buttonsTab[i].className = buttonsTab[i].className.replace(" active", "");
  }

  document.getElementById(tab+'Tab').style.display = "block";
  document.getElementById(tab+'Tab').className += " active";
}


function confirm_deleteWidget (list) {

  let id = ipcRenderer.sendSync('info', 'id');
  let win = BrowserWindow.fromId(id);

  let options = {
      type: 'question',
      title: 'Confirmer la suppression',
      message: list ? 'Voulez-vous vraiment supprimer tous les Widgets ?' : 'Voulez-vous vraiment supprimer le Widget ?',
      buttons: ['Oui', 'Non']
  };

   remote.dialog.showMessageBox(win, options, function(response) {
        if (response == 0) {
            if (list) {
              deleteAllWidgets();
            } else {
              deleteWidget();
            }
        }
    });
}


function deleteAllWidgets() {

  let status = ipcRenderer.sendSync('manage_eeDomus_node',
      {
        action: 'deleteAllWidgets',
        classname: 'eeDomusWidget'
      }
  );

  if (status) { // inclus le widget créé dans la liste des widgets existants
    existingWidgets = ipcRenderer.sendSync('getWidgets');
    if (selected_periph_data) {
      let item = selected_periph_data.instance.get_selected(true)[0];
      set_description(item);
      setImage(item);
    }
  }

  document.getElementById('checkbox-selected-widget').disabled = true;
  document.getElementById('checkbox-selected-widget').toggled = false;
  document.getElementById('label-selected-widget').innerHTML= msg.periph_no_widget;
  setConfigWidgetValue(Config.widget);

  // notif de création
  let notification = document.getElementById('notification');
  notification.innerHTML = (status == true) ?  "Les Widgets ont été supprimés !" : "Erreur, impossible de supprimer les Widgets"
  notification.opened = true;
}


function delete_image() {

  let id = ipcRenderer.sendSync('info', 'id');
  let win = BrowserWindow.fromId(id);

  let options = {
      type: 'question',
      title: 'Confirmer la suppression',
      message: 'Voulez-vous vraiment supprimer les images personnalisées pour le périphérique ?',
      buttons: ['Oui', 'Non']
  };

 remote.dialog.showMessageBox(win, options, function(response) {
      if (response == 0) {
        getPeriphByName(selected_periph_data.instance.get_selected(true)[0].text, selected_periph_data.instance.get_selected(true)[0].parent)
        .then(infos => {
            let status = ipcRenderer.sendSync('manage_eeDomus_node',
                {
                  action: 'delete_image',
                  periph_id: infos.periph_id,
                  usage: infos.usage_name
                }
            );

            if (status)
              setImage(selected_periph_data.instance.get_selected(true)[0]);

            // notif de création
            let notification = document.getElementById('notification');
            notification.innerHTML = (status == true) ?  "Les images personnalisées ont été supprimées !" : "Erreur, impossible de supprimer les images personnalisées"
            notification.opened = true;
        })
      }
  });

}



function deleteWidget() {

  let item = selected_periph_data.instance.get_selected(true)[0];
  let status = ipcRenderer.sendSync('manage_eeDomus_node',
      {
        action: 'delete',
        periph_id: item.id,
        classname: 'eeDomusWidget'
      }
  );

  if (status) { // inclus le widget créé dans la liste des widgets existants
    existingWidgets = ipcRenderer.sendSync('getWidgets');
    set_description(item);
    setImage(item);
  }

  document.getElementById('checkbox-selected-widget').disabled = true;
  document.getElementById('checkbox-selected-widget').toggled = false;
  document.getElementById('label-selected-widget').innerHTML= msg.periph_no_widget;
  setConfigWidgetValue(Config.widget);

  // notif de création
  let notification = document.getElementById('notification');
  notification.innerHTML = (status == true) ?  "Le Widget a été supprimé !" : "Erreur, impossible de supprimer le Widget"
  notification.opened = true;

}


function createWidget() {

  if (!selected_periph_data) return;

  // retourne la clé de value_type
  let key = _.findKey(value_type, function (num) {
      return num == document.getElementById('type-value').innerHTML;
  })

  let click_values = [];
  let dblclick_values = [];
  let item = selected_periph_data.instance.get_selected(true)[0];

  if (document.getElementById('div-value-list').style.visibility == "visible" && key == 'list') {
    if (document.getElementById('click-value-list').value.length == 1 || document.getElementById('click-value-list').value.length > 2) {
      let notification = document.getElementById('notification');
      notification.innerHTML = "Vous ne pouvez choisir que 2 valeurs ou aucune pour le mode intérrupteur du Widget"
      notification.opened = true;
      return;
    }
    // recherche de la liste de valeurs complete (valeur + description) concernée
    let list = _.find(value_list, function(num){
      return num.periph_id == item.id;
    });
    // les valeurs concervées pour click event pour le widget
    let selected_click_values = document.getElementById('click-value-list').value;

    // Les valeurs pour click event par rapport à la description
    _.each(list.values, function (values) {
      if (_.contains(selected_click_values, values.description)) {
        click_values.push({value: values.value, description: values.description})
      }
    });
    // les valeurs concervées pour dblclick event pour le widget
    let selected_dblclick_values = document.getElementById('dblclick-value-list').value;

    // Les valeurs pour click event par rapport à la description
    _.each(list.values, function (values) {
      if (_.contains(selected_dblclick_values, values.description)) {
        dblclick_values.push({value: values.value, description: values.description})
      }
    });
  }

  let ismacro;
  if (document.getElementById('macro-action-periph').toggled == true)
    ismacro = (document.getElementById('macro-action-periph').toggled == true) ? true : false;

  // création du widget
  let status = ipcRenderer.sendSync('manage_eeDomus_node',
      {
        action: 'create',
        type: key,  // float, string, list
        click_values: click_values, // valeurs conservées pour click
        dblclick_values: dblclick_values, // valeurs conservées pour dblclick
        periph_id: item.id,
        usage: document.getElementById('usage-value').innerHTML,
        class: "eeDomusWidget",
        title: item.text,
        macro: ismacro,
        room: item.parent
      }
  );

  if (status) {// inclus le widget créé dans la liste des widgets existants
    existingWidgets = ipcRenderer.sendSync('getWidgets');
    set_description(item);
    document.getElementById('checkbox-selected-widget').disabled = false;
    document.getElementById('label-selected-widget').disabled = false;
    document.getElementById('label-selected-widget').innerHTML= msg.widget_no_style;

    setConfigWidgetValue(config_widget_save);
    setImage(item);
  }

  // notif de création
  let notification = document.getElementById('notification');
  notification.innerHTML = (status == true) ?  "Le Widget a été créé !" : "Erreur, impossible de créer le Widget"
  notification.opened = true;

}


document.getElementById('x-select-action').addEventListener('click', function(){

  let child;
  let values = document.getElementById('x-menu-action');
  for(let i=0; i < values.childNodes.length;i++) {
      child = values.childNodes[i];
      if (child.toggled) {
        break;
      }
  }
  if (child && child.id != last_selected_item_action_value) {
    last_selected_item_action_value = child.id;
    let item = selected_periph_data.instance.get_selected(true)[0];
    getPeriphByName(item.text, item.parent)
    .then(infos => {
      getValueList(infos.periph_id)
      .then(list => test_exist_rule (infos, item.parent, list, child.id))
      .then(isExist => add_associated_rule_infos(child, isExist))
    })
  }
});


document.getElementById('delete-rules').addEventListener('click', function(){

  let item = selected_periph_data.instance.get_selected(true)[0];
  let room = item.parent;

  getPeriphByName(item.text, item.parent)
  .then(infos => {
    let name = (_.contains(_.keys(Config), infos.name.replace(/ /g,'')))
            ? infos.name.replace(/ /g,'')
            : infos.name.replace(" "+room,'').replace(" "+room,'').replace(" "+room,'').replace(/ /g,'');

      let isExist;
      for (let i in Config.clients) {
        if (_.contains(_.keys(Config.clients[i]), name)) {
            if (i != room) {
                isExist = true;
                break;
            }
        }
      }

      let ID = ipcRenderer.sendSync('geteeDomusID');
      let win = BrowserWindow.fromId(ID);
      let options;
      if (!isExist) {
        options = {
          type: "question",
          title: "Supprimer les règles",
          buttons: ["La règle affichée", "Toutes les règles", "Annuler"],
          detail: "Choisissez si vous désirez supprimer la règle qui est affichée ou toutes les règles de ce périphérique."
        };
        dialog.showMessageBox(win, options, function (response) {
          if (response == 2) return;
          delete_rules(response, infos, name, isExist);
        })
      } else {
        options = {
          type: "question",
          title: "Supprimer les règles",
          buttons: ["Supprimer toutes les règles", "Annuler"],
          detail: "Comme ce groupe de règles est partagé par un autre périphérique d'une autre pièce, vous ne pouvez pas choisir la règle à supprimer. Toutes les règles seront supprimées pour ce périphérique."
        };
        dialog.showMessageBox(win, options, function (response) {
          if (response == 1) return;
          delete_rules(0, infos, name, isExist);
        })
      }
    })
});


function delete_rules(response, infos, name, isExist) {

  let item = selected_periph_data.instance.get_selected(true)[0];
  let room = item.parent;

  let item_menu;
  let deleteIntent;
  if (!isExist) {
    if (usage_type_mapping[infos.usage_name].action == 'get') {
        Config = _.omit(Config, name);
    } else {
      let values = document.getElementById('x-menu-action');
      for(let i=0; i < values.childNodes.length;i++) {
          item_menu = values.childNodes[i];
          if (item_menu.toggled) {
            break;
          }
      }
      Config[name] = _.omit(Config[name], item_menu.value);
      if (_.size(Config[name]) == 1 || response == 1) {
        Config = _.omit(Config, name);
        deleteIntent = true;
      }
    }
  } else if (usage_type_mapping[infos.usage_name].action == 'set' && _.size(Config[name]) > 1) {
    deleteIntent = true;
  }

  if (!isExist && (deleteIntent || response == 1)) {
    Config.intentRules = _.reject(Config.intentRules, function(num){ return num == name; });
  }
  // le périph id dans la pièce
  if (usage_type_mapping[infos.usage_name].action == 'get' || deleteIntent || response == 1)
    Config.clients[room] = _.omit(Config.clients[room], name);
  if (_.size(Config.clients[room]) == 0) {
      Config.clients = _.omit(Config.clients, room);
  }

  let status = ipcRenderer.sendSync('save_eeDomusFullConfig',Config)
  let notification = document.getElementById('notification');
  let msg_status = (status) ? "Règle(s) supprimée(s) !" : "Erreur, impossible de supprimer les règles";
  notification.innerHTML = msg_status;
  notification.opened = true;
  if (status)
    setRuleInfos(item, (item_menu ? item_menu.id : null));

}


function save_rule() {

  let rules = document.getElementById("rules-to-add");
  if (rules.value == "") {
    let notification = document.getElementById('notification');
    notification.innerHTML = "Vous devez ajouter au moins une règle avant de sauvegarder";
    notification.opened = true;
    return;
  }

  let item = selected_periph_data.instance.get_selected(true)[0];
  let room = item.parent;

  getPeriphByName(item.text, item.parent)
  .then(infos => {
      let name;
      let command;
      let isCusto;
      let macro;
      if (document.getElementById('new-rule').toggled == true) {
        name = infos.name.replace(/ /g,'');
        command = document.getElementById('add-function').value;
        isCusto = true;
      } else {
        if (_.contains(_.keys(Config), infos.name.replace(/ /g,''))) {
            name = infos.name.replace(/ /g,'');
            command = Config[name].command;
        } else  {
            name = infos.name.replace(" "+room,'').replace(" "+room,'').replace(" "+room,'').replace(/ /g,'');
            command = (usage_type_mapping[infos.usage_name].action == 'get') ? 'get' : 'set';
        }
      }

      if (!Config.clients[room])
        Config.clients[room] = {};

      if (_.contains(_.values(Config.clients[room]), infos.periph_id)) {
        let key = _.findKey(Config.clients[room], function(num) {
          return num == infos.periph_id;
        })
        Config.clients[room] = _.omit(Config.clients[room], key);
      }

      Config.clients[room][name] = infos.periph_id;

      if (!Config[name])
        Config[name] = {};

      let item_menu;
      if (usage_type_mapping[infos.usage_name].action == 'get') {
          Config[name].command = command;
          Config[name].rules = rules.value;
          if (usage_type_mapping[infos.usage_name].answer)
            Config[name].answer = usage_type_mapping[infos.usage_name].answer;
      } else {
          Config[name].command = command;
          let values = document.getElementById('x-menu-action');
          for(let i=0; i < values.childNodes.length;i++) {
              item_menu = values.childNodes[i];
              if (item_menu.toggled) {
                break;
              }
          }
          if (item_menu && item_menu.id) {
            Config[name][item_menu.value] = rules.value;
          }

          if (!isCusto && document.getElementById('macro-action').toggled == true) {
              Config[name].macro = true;
          }
      }

      if (!_.contains(Config.intentRules, name))
        Config.intentRules.push(name);

      let status = ipcRenderer.sendSync('save_eeDomusFullConfig',Config)
      if (!status) {
        let notification = document.getElementById('notification');
        notification.innerHTML = "Erreur, impossible de sauvegarder les règles";
        notification.opened = true;
        return;
      }

      setRuleInfos(item, (item_menu ? item_menu.id : null));
      if (document.getElementById("x-select-action").style.visibility == "visible")
        document.getElementById('x-select-action').disabled = false;

      if (isCusto && document.getElementById('add-function').value != 'set' && document.getElementById('add-function').value != 'get') {
          add_function(document.getElementById('add-function').value)
          .then(() => {
            document.getElementById('add-function').style.visibility == "hidden";
            document.getElementById('add-function').value = '';

            let notification = document.getElementById('notification');
            notification.innerHTML = "Règle(s) sauvegardée(s) et fonction ajoutée dans le fichier eeDomus.js !";
            notification.opened = true;
          })
          .catch(err => {
            document.getElementById('add-function').style.visibility == "hidden";
            document.getElementById('add-function').value = '';
            console.log('fichier eeDomus.js', err);
            let notification = document.getElementById('notification');
            notification.innerHTML = "Règle(s) sauvegardée(s) mais une erreur dans l'ajout de la fonction dans le fichier eeDomus.js !";
            notification.opened = true;
          })
      } else {
          let notification = document.getElementById('notification');
          notification.innerHTML = "Règle(s) sauvegardée(s) !";
          notification.opened = true;
      }
  })

}


function add_function(newFunction) {
  return new Promise((resolve, reject) => {
    let eeDomusJS = fs.readFileSync(path.normalize(__dirname+'/../../eeDomus.js'), 'utf8');
    if (eeDomusJS.indexOf(newFunction) == -1) {
      let start = eeDomusJS.indexOf("let tblCommand = {");
      if (start != -1) {
        let cutStart = eeDomusJS.substring(0, start+18);
        let cutEnd = eeDomusJS.substring(start+18);
        let newJsFile = cutStart+"\n    "+newFunction+": function() {\n       //Fonction personalisée pour le périphérique "+selected_periph_data.instance.get_selected(true)[0].text+"\n      // Ajouter ici votre code !\n    },"+cutEnd;
        try{
          fs.writeFileSync (path.normalize(__dirname+'/../../eeDomus.js'), newJsFile, 'utf8');
          resolve();
        } catch(err) {
          reject(err);
        }
      } else {
        reject("repère de l'ajout introuvable");
      }
    } else {
      resolve();
    }
  })
}


function setNewImage(elem, name, file, save_type) {

  getPeriphByName(selected_periph_data.instance.get_selected(true)[0].text, selected_periph_data.instance.get_selected(true)[0].parent)
  .then(infos => {
    let id =  (save_type == 1)
              ? infos.periph_id
              : null;

    let status = ipcRenderer.sendSync('manage_eeDomus_node',
        {
          action: 'newImage',
          periph_id: id,
          usage_name: infos.usage_name,
          name: name,
          file: file
        }
    );

    document.getElementById(elem).src = file;
    setImage(selected_periph_data.instance.get_selected(true)[0]);

    // notif
    let msg = id
              ? "Image personnalisée sauvegardée pour l'état "+name+" du périphérique"
              : "Image par défaut sauvegardée pour l'état "+name+" des périphériques d'usage "+infos.usage_name;
    let notification = document.getElementById('notification');
    notification.innerHTML = msg;
    notification.opened = true;

  })
  .catch(err => {
		console.log('err:', err || 'Erreur dans la recherche des périphériques eeDomus');
	})

}



function init() {
  let data = addData();
  $('#jstree').jstree({
    "themes" : { "stripes" : true },
    "types" : {
      "room" : {
        "icon" : "./images/room.png"
      },
      "periph" : {
        "icon" : "./images/peripheric.png"
      }
    },
    "plugins" : ["types"],
    'core' : {
      'data' : data
    }
  });

  $('#jstree').on("changed.jstree", function (e, periph_data) {
    selected_periph_data = periph_data;
    set_description(periph_data.instance.get_selected(true)[0]);

    document.getElementById('x-select-action').disabled = false;
    setRuleInfos(periph_data.instance.get_selected(true)[0]);

    isAlreadyExist(periph_data.instance.get_selected(true)[0].id)
    .then(isExist => {
       if (!isExist || (isExist && !isExist.style)) {
         if (!isExist) {
            document.getElementById('checkbox-selected-widget').disabled = true;
            document.getElementById('label-selected-widget').innerHTML= msg.periph_no_widget;

            setConfigWidgetValue(Config.widget);
          } else {
            document.getElementById('checkbox-selected-widget').disabled = false;
            document.getElementById('label-selected-widget').innerHTML= msg.widget_no_style;

            setConfigWidgetValue(config_widget_save);
          }
          document.getElementById('checkbox-selected-widget').toggled = false;

       } else {
          document.getElementById('checkbox-selected-widget').disabled = false;
          document.getElementById('label-selected-widget').innerHTML= msg.widget_with_style;

          setConfigWidgetValue(isExist.style);
          document.getElementById('checkbox-selected-widget').toggled = true;
       }

       setImage(periph_data.instance.get_selected(true)[0]);
    })

  });

  setConfigWidgetValue(Config.widget);
  document.getElementById('label-selected-widget').innerHTML= msg.no_periph_selected;
  document.getElementById('testing_widget').disabled = true;
}


function setConfigWidgetValue(config) {
    document.getElementById('widget-color').value = config.color ? config.color : Config.widget.color;
    document.getElementById('widget-color-picker').value = config.color ? config.color : Config.widget.color;
    document.getElementById('widget-text-color').value = config.textColor ? config.textColor : Config.widget.textColor;
    document.getElementById('widget-text-color-picker').value = config.textColor ? config.textColor : Config.widget.textColor;
    document.getElementById('opacity-widget').value = config.opacity ? config.opacity : Config.widget.opacity;
    document.getElementById('padding-widget').value = config.padding ? config.padding.replace('px','') : Config.widget.padding.replace('px','');
    document.getElementById('font-size-title').value = config.font ? config.font.title.replace('px','') : Config.widget.font.title.replace('px','');
    document.getElementById('font-size-value').value = config.font ? config.font.value.replace('px','') : Config.widget.font.value.replace('px','');
    document.getElementById('font-size-status').value = config.font ? config.font.status.replace('px','') : Config.widget.font.status.replace('px','');
    document.getElementById('padding-value').value = 0;
    document.getElementById('size-widget').value = 0;

    document.getElementById('testing_widget').disabled = (existingWidgets.length == 0) ? true : false;
}


function setImage(item) {

  getPeriphByName(item.text, item.parent)
  .then(infos => {
      isAlreadyExist(infos.periph_id)
      .then(isExist => {

          if (!isExist) {  // pas de widget
            document.getElementById('label-description-icon').innerHTML = 'Créez un widget pour ce périphérique pour voir ses images associées.';
            document.getElementById('icon1-widget').style.visibility = "hidden";
            document.getElementById('icon2-widget').style.visibility = "hidden";
            document.getElementById('icon3-widget').style.visibility = "hidden";
            document.getElementById('label-icon1-widget').style.visibility = "hidden";
            document.getElementById('label-icon2-widget').style.visibility = "hidden";
            document.getElementById('label-icon3-widget').style.visibility = "hidden";
            document.getElementById('sublabel-icon1-widget').style.visibility = "hidden";
            document.getElementById('sublabel-icon2-widget').style.visibility = "hidden";
            document.getElementById('sublabel-icon3-widget').style.visibility = "hidden";
            document.getElementById('x-select-widget').style.visibility = "hidden";
            document.getElementById('label-icon').style.visibility = "hidden";
            document.getElementById('delete-image').style.visibility = "hidden";
          } else {
              // A partir d'ici -> Widget
              let values;
              if (infos.value_type == 'list') {  // 3 images possibles
                values =  _.pluck(isExist.click_values, 'description');
                let dblclick_values =  _.pluck(isExist.dblclick_values, 'description');

                if (values.length == 0) { // pour prise d'info ou menu circulaire
                  if (dblclick_values.length > 0) {// retour d'état
                    document.getElementById('label-icon').innerHTML = 'Ce périphérique est un menu circulaire et n\'a pas de valeur fixe. L\'image affichée est "Autre".'
                    document.getElementById('label-description-icon').innerHTML = 'Choisissez l\'image pour le widget du périphérique:'
                    document.getElementById('icon1-widget').style.visibility = "hidden";
                    document.getElementById('icon2-widget').style.visibility = "visible";
                    document.getElementById('icon3-widget').style.visibility = "hidden";
                    document.getElementById('label-icon1-widget').style.visibility = "hidden";
                    document.getElementById('label-icon2-widget').style.visibility = "visible";
                    document.getElementById('label-icon3-widget').style.visibility = "hidden";
                    document.getElementById('sublabel-icon1-widget').style.visibility = "hidden";
                    document.getElementById('sublabel-icon2-widget').style.visibility = "visible";
                    document.getElementById('sublabel-icon3-widget').style.visibility = "hidden";
                    document.getElementById('label-icon').style.visibility = "visible";
                    document.getElementById('x-select-widget').style.visibility = "hidden";

                    values.push('Other');
                    getImageFiles (infos, values);
                 }  else  {
                    // Spécial !!!
                    document.getElementById('label-description-icon').innerHTML = 'Choisissez les images pour le widget du périphérique:'
                    document.getElementById('icon1-widget').style.visibility = "hidden";
                    document.getElementById('icon2-widget').style.visibility = "hidden";
                    document.getElementById('icon3-widget').style.visibility = "visible";
                    document.getElementById('label-icon1-widget').style.visibility = "hidden";
                    document.getElementById('label-icon2-widget').style.visibility = "hidden";
                    document.getElementById('label-icon3-widget').style.visibility = "visible";
                    document.getElementById('sublabel-icon1-widget').style.visibility = "hidden";
                    document.getElementById('sublabel-icon2-widget').style.visibility = "hidden";
                    document.getElementById('sublabel-icon3-widget').style.visibility = "visible";
                    document.getElementById('x-select-widget').style.visibility = "visible";
                    document.getElementById('label-icon').style.visibility = "visible";
                    document.getElementById('label-icon').innerHTML = 'Ce périphérique est de type "liste de valeurs" mais défini comme un retour d\'état. Choisissez dans le liste déroulante tous les états possibles pour voir les images associées.'

                    create_x_menu(infos);
                  }
                } else if (values.length == 2 && dblclick_values.length == 0) { // On, Off
                  document.getElementById('label-description-icon').innerHTML = 'Choisissez les 2 images pour le widget du périphérique:'
                  document.getElementById('icon1-widget').style.visibility = "visible";
                  document.getElementById('icon2-widget').style.visibility = "hidden";
                  document.getElementById('icon3-widget').style.visibility = "visible";
                  document.getElementById('label-icon1-widget').style.visibility = "visible";
                  document.getElementById('label-icon2-widget').style.visibility = "hidden";
                  document.getElementById('label-icon3-widget').style.visibility = "visible";
                  document.getElementById('label-icon3-widget').className = "label-icon3-widget label-min label-bold";
                  document.getElementById('sublabel-icon1-widget').style.visibility = "visible";
                  document.getElementById('sublabel-icon2-widget').style.visibility = "hidden";
                  document.getElementById('sublabel-icon3-widget').style.visibility = "visible";
                  document.getElementById('x-select-widget').style.visibility = "hidden";
                  document.getElementById('label-icon').style.visibility = "visible";
                  document.getElementById('label-icon').innerHTML = 'Ce périphérique est un bouton intérrupteur sans menu circulaire.';
                  getImageFiles (infos, values);
                } else { // On, Off et menu
                  document.getElementById('label-description-icon').innerHTML = 'Choisissez les 3 images pour le widget du périphérique:'
                  document.getElementById('icon1-widget').style.visibility = "visible";
                  document.getElementById('icon2-widget').style.visibility = "visible";
                  document.getElementById('icon3-widget').style.visibility = "visible";
                  document.getElementById('label-icon1-widget').style.visibility = "visible";
                  document.getElementById('label-icon2-widget').style.visibility = "visible";
                  document.getElementById('label-icon3-widget').style.visibility = "visible";
                  document.getElementById('label-icon3-widget').className = "label-icon3-widget label-min label-bold";
                  document.getElementById('sublabel-icon1-widget').style.visibility = "visible";
                  document.getElementById('sublabel-icon2-widget').style.visibility = "visible";
                  document.getElementById('sublabel-icon3-widget').style.visibility = "visible";
                  document.getElementById('x-select-widget').style.visibility = "hidden";
                  document.getElementById('label-icon').innerHTML = 'Ce périphérique est un bouton intérrupteur avec menu circulaire. L\'image "Autre" représente les états intermédiaires que vous avez sélectionnés dans la liste des valeurs accessibles par le menu circulaire. Pour, par exemple, un périphérique de type "Lampe" avec variateur de lumière, la selection de l\'état "50%" affichera cette image.'
                  document.getElementById('label-icon').style.visibility = "visible";
                  values.push('Other');
                  getImageFiles (infos, values);
                }

              } else {  // 1 image
                document.getElementById('label-description-icon').innerHTML = 'Choisissez l\'image pour le widget du périphérique.'
                document.getElementById('icon1-widget').style.visibility = "hidden";
                document.getElementById('icon2-widget').style.visibility = "visible";
                document.getElementById('icon3-widget').style.visibility = "hidden";
                document.getElementById('label-icon1-widget').style.visibility = "hidden";
                document.getElementById('label-icon2-widget').style.visibility = "visible";
                document.getElementById('label-icon3-widget').style.visibility = "hidden";
                document.getElementById('sublabel-icon1-widget').style.visibility = "hidden";
                document.getElementById('sublabel-icon2-widget').style.visibility = "visible";
                document.getElementById('sublabel-icon3-widget').style.visibility = "hidden";
                document.getElementById('x-select-widget').style.visibility = "hidden";
                document.getElementById('label-icon').innerHTML = 'Ce périphérique est un retour d\'état et n\'a pas de valeur fixe. L\'image est affichée "Autre".'
                document.getElementById('label-icon').style.visibility = "visible";

                values = ['Other'];
                getImageFiles (infos, values);
              }
          }

      })
  })

}



function getSpecialImageFiles (infos, value, values) {

  let file = ipcRenderer.sendSync('manage_eeDomus_node',
  {
    action: 'getImage',
    usage: infos.usage_name,
    periph_id: infos.periph_id,
    value: value,
    values: values
  })

  if (file) {
    let type;
    if (file.indexOf('Default\\eeDomus') != -1) {
      type = 'default';
    } else {
      type = (file.indexOf(infos.periph_id) != -1) ? 'perso' : 'global';
    }

    let imgText = {default: "Aucune image (par défaut)", usage: "Image définie pour l'usage", perso: "Image personnalisée"};
    switch (type) {
      case 'default':
        document.getElementById('sublabel-icon3-widget').innerHTML = imgText.default;
        document.getElementById('delete-image').style.visibility = "hidden";
        break;
      case 'global':
        document.getElementById('sublabel-icon3-widget').innerHTML = imgText.usage;
        document.getElementById('delete-image').style.visibility = "hidden";
        break;
      case 'perso':
        document.getElementById('sublabel-icon3-widget').innerHTML = imgText.perso;
        document.getElementById('delete-image').style.visibility = "visible";
        document.getElementById('delete-image').disabled = false;
    }

    document.getElementById('icon3-widget').src = file;
    document.getElementById('label-icon3-widget').className = "label-min label-bold special-icon3-label"
    document.getElementById('label-icon3-widget').innerHTML = value;

  } else {
    let notification = document.getElementById('notification');
    notification.innerHTML = "Erreur: Impossible de rechercher l'image pour le périphérique"
    notification.opened = true;
  }

}


function getImageFiles (infos, values) {

  let files = ipcRenderer.sendSync('manage_eeDomus_node',
  {
    action: 'getImages',
    usage: infos.usage_name,
    periph_id: infos.periph_id,
    values: values
  })

  // fichier par défaut
  let defaultImage = path.normalize(__dirname+'/../images/widget/Default/eeDomus.png');
  let status_files = [];
  searchImage(values, 0, files, 1, defaultImage, status_files, infos.periph_id, () => {
    // global, perso, default
    let imgText = {default: "Aucune image (par défaut)", usage: "Image définie pour l'usage", perso: "Image personnalisée"};

    switch (status_files.length) {
      case 1: // Other
        if (status_files[0].type == 'default')
          document.getElementById('sublabel-icon2-widget').innerHTML = imgText.default;
        if (status_files[0].type == 'global')
          document.getElementById('sublabel-icon2-widget').innerHTML = imgText.usage;
        if (status_files[0].type == 'perso')
          document.getElementById('sublabel-icon2-widget').innerHTML = imgText.perso;
        break;
      case 2:
        if (status_files[0].type == 'default')
          document.getElementById('sublabel-icon1-widget').innerHTML = imgText.default;
        if (status_files[0].type == 'global')
          document.getElementById('sublabel-icon1-widget').innerHTML = imgText.usage;
        if (status_files[0].type == 'perso')
          document.getElementById('sublabel-icon1-widget').innerHTML = imgText.perso;
        if (status_files[1].type == 'default')
          document.getElementById('sublabel-icon3-widget').innerHTML = imgText.default;
        if (status_files[1].type == 'global')
          document.getElementById('sublabel-icon3-widget').innerHTML = imgText.usage;
        if (status_files[1].type == 'perso')
          document.getElementById('sublabel-icon3-widget').innerHTML = imgText.perso;
        break;
      case 3:
        if (status_files[0].type == 'default')
          document.getElementById('sublabel-icon1-widget').innerHTML = imgText.default;
        if (status_files[0].type == 'global')
          document.getElementById('sublabel-icon1-widget').innerHTML = imgText.usage;
        if (status_files[0].type == 'perso')
          document.getElementById('sublabel-icon1-widget').innerHTML = imgText.perso;
        if (status_files[1].type == 'default')
          document.getElementById('sublabel-icon2-widget').innerHTML = imgText.default;
        if (status_files[1].type == 'global')
          document.getElementById('sublabel-icon2-widget').innerHTML = imgText.usage;
        if (status_files[1].type == 'perso')
          document.getElementById('sublabel-icon2-widget').innerHTML = imgText.perso;
        if (status_files[2].type == 'default')
          document.getElementById('sublabel-icon3-widget').innerHTML = imgText.default;
        if (status_files[2].type == 'global')
          document.getElementById('sublabel-icon3-widget').innerHTML = imgText.usage;
        if (status_files[2].type == 'perso')
          document.getElementById('sublabel-icon3-widget').innerHTML = imgText.perso;
        break;
    }

    if (_.contains(_.pluck(status_files, 'type'), "perso")) {
      document.getElementById('delete-image').style.visibility = "visible";
      document.getElementById('delete-image').disabled = false;
    } else
      document.getElementById('delete-image').style.visibility = "hidden";

  });

}


function create_x_menu(infos) {

    getValueList(infos.periph_id)
    .then(list => {
      if (list) {

        let values =  {
          click_values: list.values,
          dblclick_values: [],
          type: 'list'
        }

        let menuValues = document.getElementById('x-menu-widget');
        $("#x-menu-widget").children().remove();

        for (let i=0; i<list.values.length; i++) {
          let menuitem = document.createElement("x-menuitem");
          menuitem.setAttribute('id', infos.periph_id+'-value-'+i);
          menuitem.value = list.values[i].description.replace(/ /g,'_');
          let label = document.createElement("x-label");
          label.className = 'size-max';
          label.innerHTML = list.values[i].description;
          label.setAttribute('id', infos.periph_id+'-label-'+i);
          menuitem.appendChild(label);
          menuValues.appendChild(menuitem);
          menuitem.addEventListener('click', function(){
            getSpecialImageFiles (infos, list.values[i].description, values);
          });
        }
        document.getElementById(infos.periph_id+'-value-0').toggled = true;
        getSpecialImageFiles (infos, document.getElementById(infos.periph_id+'-label-0').innerHTML, values);
      }
    })
}


function searchImage(values, pos, files, count, defaultImage, status_files, periph_id, callback) {

  if (pos >= values.length)
      return callback();

   if (files.length == 0) {
     putImage(values.length, count, values[pos], defaultImage, (val) => {
         status_files.push({name: values[pos], type: 'default'});
         searchImage(values, ++pos, files, val, defaultImage, status_files, periph_id, callback);
     })
     return;
   }

   for (let i=0; i<files.length; i++) {
      let test = files[i].substring(files[i].lastIndexOf("\\")).replace('\\','').replace('.png','');
      if (values[pos] == test) {
        putImage(values.length, count, values[pos], files[i], (val) => {
            if (files[i].indexOf(periph_id) != -1)
                status_files.push({name: values[pos], type: 'perso'});
            else
                status_files.push({name: values[pos], type: 'global'});

            searchImage(values, ++pos, files, val, defaultImage, status_files, periph_id, callback);
        })
        break;
      }

      if (i+1 == files.length) {
        putImage(values.length, count, values[pos], defaultImage, (val) => {
            status_files.push({name: values[pos], type: 'default'});
            searchImage(values, ++pos, files, val, defaultImage, status_files, periph_id, callback);
        })
      }
   }

}



function putImage (state, count, title, file, callback) {

  switch (state) {
    case 1:
      document.getElementById('icon2-widget').src = file;
      document.getElementById('label-icon2-widget').innerHTML = "Autre";
      callback (count);
      break;
    case 2:
      document.getElementById('icon'+count+'-widget').src = file;
      document.getElementById('label-icon'+count+'-widget').innerHTML = title;
      callback (count+2);
      break;
    case 3:
      document.getElementById('icon'+count+'-widget').src = file;
      document.getElementById('label-icon'+count+'-widget').innerHTML = (title == "Other") ? "Autre" : title;
      callback (count+1);
  }

}


function set_description(item) {
  getPeriphByName(item.text, item.parent)
  .then(infos => setPeriphInfos(infos))
  .catch(err => {
		console.log('err:', err || 'Erreur dans la recherche des périphériques eeDomus');
	})
}


function setPeriphInfos (infos) {

  document.getElementById('peripheric-value').innerHTML = infos.name;
  document.getElementById('id-value').innerHTML = infos.periph_id;
  document.getElementById('parent-id-value').innerHTML = infos.parent_periph_id;
  document.getElementById('usage-value').innerHTML = infos.usage_name;
  document.getElementById('battery-value').innerHTML = infos.battery ? infos.battery+" %" : "N/A";
  document.getElementById('type-value').innerHTML = value_type[infos.value_type];
  switch (infos.value_type) {
    case 'list':
      document.getElementById('div-float-label').style.visibility = "hidden";
      getValueList(infos.periph_id)
      .then(list => {
          if (list) {
            isAlreadyExist(infos.periph_id)
            .then(isExist => {

              console.log('ici isExist', isExist)
              let click_value_description;
              let dblclick_value_description;
              if (isExist) {
                document.getElementById('description-clic-list').innerHTML = 'Les 2 valeurs "Intérrupteur" pour l\'utilisation principale du widget (<b>1 CLIC sur son image</b>).'
                click_value_description =  _.pluck(isExist.click_values, 'description');
                document.getElementById('click-value-list').disabled = true;
                document.getElementById('description-dblclic-list').innerHTML = 'Les valeurs accessibles par le menu circulaire du widget (<b>1 DOUBLE-CLIC sur son image</b>).';
                dblclick_value_description =  _.pluck(isExist.dblclick_values, 'description');
                document.getElementById('dblclick-value-list').disabled = true;

                document.getElementById('info-list').className = "label-max";
                document.getElementById('info-list').innerHTML = "Un widget existe déjà pour ce périphérique, pour le modifier, supprimez-le";

                document.getElementById('create_widget').disabled = true;
                document.getElementById('delete_widget').disabled = false;

                document.getElementById('set-or-macro-periph-label').style.visibility = "hidden";
                if (isExist.macro) {
                  document.getElementById('set-action-periph').toggled = false;
                  document.getElementById('macro-action-periph').toggled = true;
                } else {
                  document.getElementById('set-action-periph').toggled = true;
                  document.getElementById('macro-action-periph').toggled = false;
                }
                document.getElementById('set-action-periph').disabled = true;
                document.getElementById('macro-action-periph').disabled = true;
              } else {
                document.getElementById('description-clic-list').innerHTML = 'Choisissez 2 valeurs "Intérrupteur" pour l\'utilisation principale du widget (<b>1 CLIC sur son image</b>). Par exemple, "On" et "Off". Aucune valeur désactive le clic.'
                dblclick_value_description = click_value_description =  _.pluck(list.values, 'description');
                document.getElementById('click-value-list').disabled = false;
                document.getElementById('description-dblclic-list').innerHTML = 'Choisissez les valeurs accessibles par le menu circulaire du widget (<b>1 DOUBLE-CLIC sur son image</b>). Aucune valeur désactive le double-clic.'
                document.getElementById('dblclick-value-list').disabled = false;

                document.getElementById('info-list').className = "info-list label-min color-min";
                document.getElementById('info-list').innerHTML = 'Vous pouvez aussi supprimer toutes les valeurs des 2 listes. Dans ce cas, <b>1 CLIC sur son image</b> rafraichit les informations du widget. Par exemple, pour un détecteur de mouvement de type "Liste de valeurs".'

                document.getElementById('create_widget').disabled = false;
                document.getElementById('delete_widget').disabled = true;

                document.getElementById('set-or-macro-periph-label').style.visibility = "visible";
                document.getElementById('set-action-periph').disabled = false;
                document.getElementById('macro-action-periph').disabled = false;
                document.getElementById('set-action-periph').toggled = true;
                document.getElementById('macro-action-periph').toggled = false;
              }
              document.getElementById('div-value-list').style.visibility = "visible";
              document.getElementById('div-value-list').style.display = "block";

              document.getElementById('click-value-list').value = click_value_description;
              document.getElementById('dblclick-value-list').value = dblclick_value_description;
            })

          } else {
            // notif de création
            let notification = document.getElementById('notification');
            notification.innerHTML = "Erreur, impossible de récupérer les informations du périphérique"
            notification.opened = true;
          }
      })
      break;
    case 'float':
    case 'string': // Par défaut, je n'ai pas de périphérique qui renvoie cette valeur...
      document.getElementById('div-value-list').style.visibility = "hidden";
      document.getElementById('set-or-macro-periph-label').style.visibility = "hidden";
      isAlreadyExist(infos.periph_id)
      .then(isExist => {
          if (isExist) {
            document.getElementById('float-label').className = "label-max top-pos";
            document.getElementById('float-label').innerHTML = "Un widget existe déjà pour ce périphérique";
            document.getElementById('create_widget').disabled = true;
            document.getElementById('delete_widget').disabled = false;
          } else {
            document.getElementById('float-label').className = "label-min color-min float-label";
            document.getElementById('float-label').innerHTML = '<b>1 CLIC sur son image</b> rafraichit les informations du widget comme par exemple, pour des périphériques de type température, de consommation, de luminosité, etc...';
            document.getElementById('create_widget').disabled = false;
            document.getElementById('delete_widget').disabled = true;
          }
          document.getElementById('div-float-label').style.visibility = "visible";
          document.getElementById('div-float-label').style.display = "block";
      })
      break;
    default:
      document.getElementById('div-value-list').style.visibility = "hidden";
  }

}


function test_exist_rule (infos, room, list, item_menu) {

  return new Promise((resolve, reject) => {
      let name = (_.contains(_.keys(Config), infos.name.replace(/ /g,'')))
            ? infos.name.replace(/ /g,'')
            : infos.name.replace(" "+room,'').replace(" "+room,'').replace(" "+room,'').replace(/ /g,'');
      let isExist;
      if (usage_type_mapping[infos.usage_name].action == 'get') {
          for (let i in Config.clients) {
            if (_.contains(_.keys(Config.clients[i]), name)) {
                if (i == room) {
                    document.getElementById('step-2-rule-exists').innerHTML = msg.rule_exist;
                    document.getElementById('rule-exists-choice').style.visibility = "hidden";
                    document.getElementById('delete-rules').disabled = false;
                    document.getElementById("save-rules").disabled = true;
                    document.getElementById('step-2-infos-actions').className = "label-min step-2-infos-actions-get-exist";
                    document.getElementById("step-2-infos-actions").innerHTML = msg.actions_exist_for_periph_get;
                    isExist = true;
                    break;
                }
            }
          }
          if (!isExist) {
            for (let i in Config.clients) {
              if (_.contains(_.keys(Config.clients[i]), name)) {
                  if (i != room) {
                      document.getElementById('step-2-rule-exists').innerHTML = msg.rule_exist_other_room;
                      document.getElementById('rule-exists-choice').style.visibility = "visible";
                      document.getElementById('same-rule').toggled = true;
                      document.getElementById('delete-rules').disabled = false;
                      document.getElementById("save-rules").disabled = false;
                      document.getElementById('step-2-infos-actions').className = "label-min step-2-infos-actions-get";
                      document.getElementById("step-2-infos-actions").innerHTML = msg.actions_not_exist_for_periph_get;
                      isExist = true;
                      break;
                  }
              }
            }
          }

          document.getElementById('set-or-macro').style.visibility = "hidden";
      } else {
          let value;
          value = item_menu ? document.getElementById(item_menu).value : list.values[0].value;
          if (_.contains(_.keys(Config), name) && _.contains(_.keys(Config[name]), value)) {
              let found;
              for (let i in Config.clients) {
                if (_.contains(_.keys(Config.clients[i]), name)) {
                    if (i == room) {
                        document.getElementById('step-2-rule-exists').innerHTML = msg.rule_exist;
                        document.getElementById('rule-exists-choice').style.visibility = "hidden";
                        document.getElementById('delete-rules').disabled = false;
                        document.getElementById("save-rules").disabled = true;
                        document.getElementById('step-2-infos-actions').className = "label-min step-2-infos-actions-set-exist";
                        document.getElementById("step-2-infos-actions").innerHTML = msg.actions_exist_for_periph_set;
                        found = true;
                        break;
                    }
                }
              }
              if (!found) {
                for (let i in Config.clients) {
                  if (_.contains(_.keys(Config.clients[i]), name)) {
                      if (i != room) {
                          document.getElementById('step-2-rule-exists').innerHTML = msg.rule_exist_other_room;
                          document.getElementById('rule-exists-choice').style.visibility = "visible";
                          document.getElementById('same-rule').toggled = true;
                          document.getElementById('delete-rules').disabled = false;
                          document.getElementById("save-rules").disabled = false;
                          document.getElementById('step-2-infos-actions').className = "label-min step-2-infos-actions-set";
                          document.getElementById("step-2-infos-actions").innerHTML = msg.actions_not_exist_for_periph_set;
                          break;
                      }
                  }
                }
              }

              document.getElementById('set-or-macro').style.visibility = "visible";
              document.getElementById('set-action').disabled = true;
              document.getElementById('macro-action').disabled = true;
              if (Config[name].macro) {
                document.getElementById('set-action').toggled = false;
                document.getElementById('macro-action').toggled = true;
              } else {
                document.getElementById('set-action').toggled = true;
                document.getElementById('macro-action').toggled = false;
              }
              isExist = true;
          }
      }

      if (!isExist) {
        if (usage_type_mapping[infos.usage_name].action == 'get') {
          document.getElementById('step-2-infos-actions').className = "label-min step-2-infos-actions";
          document.getElementById("step-2-infos-actions").innerHTML = msg.actions_exist_for_periph_get;
        } else {
          document.getElementById('step-2-infos-actions').className = "label-min step-2-infos-actions-set-exist";
          document.getElementById("step-2-infos-actions").innerHTML = msg.actions_exist_for_periph_set;

          document.getElementById('set-or-macro').style.visibility = "visible";
          document.getElementById('set-action').disabled = false;
          document.getElementById('set-action').toggled = true;
          document.getElementById('macro-action').disabled = false;
          document.getElementById('macro-action').toggled = false;
        }

        document.getElementById('step-2-rule-exists').innerHTML = msg.no_rule;
        document.getElementById('rule-exists-choice').style.visibility = "hidden";
        document.getElementById('delete-rules').disabled = true;
        document.getElementById("save-rules").disabled = true;
        document.getElementById('label-add-function').style.visibility = "hidden";
        document.getElementById('add-function').value = '';
        document.getElementById('add-function').style.visibility = "hidden";
      }
      resolve(isExist);
  })
}


function setRuleInfos(item, item_menu) {

  let room = item.parent;
  getPeriphByName(item.text, room)
  .then(infos => {

      if (!usage_type_mapping[infos.usage_name]) {
        let notification = document.getElementById('notification');
        notification.innerHTML = "Problème: L'usage de périphérique '"+infos.usage_name+"' n'est pas reconnu.<br>Ajoutez-le dans la liste des usages dans le fichier de propriétés en le catégorisant correctement puis relancez la commande (Voir la documentation pour plus de détails)."
        notification.opened = true;
        document.getElementById('div-regles').style.display = "none";
        return;
      }
      document.getElementById('div-regles').style.display = "block";
      document.getElementById('div-regles').style.visibility = "visible";

      getValueList(infos.periph_id)
      .then(list => {
          test_exist_rule (infos, room, list, item_menu)
          .then(isExist => {
            document.getElementById('label-has-rule').style.visibility = "hidden";
            document.getElementById('rules-to-add').value = '';
            document.getElementById('label-add-function').style.visibility = "hidden";
            document.getElementById('add-function').value = '';
            document.getElementById('add-function').style.visibility = "hidden";
            document.getElementById('new-rule').toggled = false;

            document.getElementById('get-set-choice').innerHTML = (usage_type_mapping[infos.usage_name].action == 'set')
                                                                  ? "Type de règle: <b>"+"Exécute l'action de la règle sur le périphérique</b>"
                                                                  : "Type de règle: <b>"+"Reçoit du périphérique une information à afficher</b>";

            setRulesActions(infos, usage_type_mapping[infos.usage_name], room, isExist, item_menu);
          })
      })
  })
}


function setRulesActions (infos, mapping, room, isExist, item_menu) {

  getValueList(infos.periph_id)
  .then(list => {
    switch (mapping.action) {
      case 'set':
        if (list && list.values.length > 0) {

          document.getElementById('x-select-action').style.visibility = "visible";
          document.getElementById('rules-to-add').className = "rules-to-add";
          document.getElementById('step-2-infos').style.visibility = "visible";
          document.getElementById('step-2-infos').innerHTML = "Choisissez une valeur puis associez-lui une (ou plusieurs) règle(s) traduite(s) en Anglais et répétez l'opération pour d'autres valeurs.";
          document.getElementById('step-2-set-infos').style.visibility = "hidden";

          let menuValues = document.getElementById('x-menu-action');
          $("#x-menu-action").children().remove();
          for (let i=0; i<list.values.length; i++) {
            let menuitem = document.createElement("x-menuitem");
            menuitem.setAttribute('id', infos.periph_id+'-action-'+i);
            menuitem.value = list.values[i].value;
            let swatchitem;
            if (mapping.type && mapping.type == 'color') {
              swatchitem = document.createElement("x-swatch");
              let test = list.values[i].value.split(',');
              test='rgb('+test[0]+','+test[1]+','+test[2]+')';
              swatchitem.value = test;
            }
            let label = document.createElement("x-label");
            label.className = 'size-max';
            label.innerHTML = list.values[i].description;
            label.setAttribute('id', infos.periph_id+'-action-label-'+i);
            if (mapping.type && mapping.type == 'color')
              menuitem.appendChild(swatchitem);
            menuitem.appendChild(label);
            menuValues.appendChild(menuitem);
            menuitem.addEventListener('click', function(){

            });
          }
          if (item_menu) {
            document.getElementById(item_menu).toggled = true;
            last_selected_item_action_value = item_menu.id;
          } else {
            document.getElementById(infos.periph_id+'-action-0').toggled = true;
            last_selected_item_action_value = infos.periph_id+'-action-0';
          }

          add_associated_rule_infos((item_menu ? document.getElementById(item_menu) : document.getElementById(infos.periph_id+'-action-0')), isExist);

        } else {
          let notification = document.getElementById('notification');
          notification.innerHTML = "L'usage du périphérique ne semble pas conforme.<br>Modifiez l'usage du périphérique dans l'application eeDomus ou modifiez-le dans la liste des usages du fichier de propriétés en le catégorisant en 'set' puis relancez la commande."
          notification.opened = true;
        }
        break;
      case 'get':
        document.getElementById('x-select-action').style.visibility = "hidden";
        document.getElementById('rules-to-add').className = "rules-to-add-get";
        document.getElementById('step-2-infos').style.visibility = "hidden";
        document.getElementById('step-2-set-infos').style.visibility = "visible";
        document.getElementById('step-2-set-infos').innerHTML = "Associez des règles en Anglais qui vous permettront de reçevoir les informations du périphérique:";
        add_associated_rule_infos(null, isExist);
    }
  })

}


function add_associated_rule_infos(selected_value, isExist) {

  document.getElementById('rules-to-add').value = "";
  let item = selected_periph_data.instance.get_selected(true)[0];
  let room = item.parent;

  getPeriphByName(item.text, room)
  .then(infos => {
      let name = (_.contains(_.keys(Config), infos.name.replace(/ /g,'')))
              ? infos.name.replace(/ /g,'')
              : infos.name.replace(" "+room,'').replace(" "+room,'').replace(" "+room,'').replace(/ /g,'');

      switch (usage_type_mapping[infos.usage_name].action) {
        case 'get':
          if (_.contains(_.keys(Config), name))
            document.getElementById('rules-to-add').value = Config[name].rules;

          if (!isExist) {
            if (usage_type_mapping[infos.usage_name].default_rule) {
              document.getElementById('translate-rule').value = usage_type_mapping[infos.usage_name].default_rule.fr;
              document.getElementById('translated-rule').value = usage_type_mapping[infos.usage_name].default_rule.en;
            } else {
                document.getElementById('translate-rule').value = "";
                document.getElementById('translated-rule').value = "";
            }
          } else {
            document.getElementById('translate-rule').value = "";
            document.getElementById('translated-rule').value = "";
          }
          break;
        case 'set':
          if (selected_value && _.contains(_.keys(Config), name) && _.contains(_.keys(Config[name]), selected_value.value)) {
              document.getElementById('rules-to-add').value = Config[name][selected_value.value];
          }

          if (!isExist) {
            if (usage_type_mapping[infos.usage_name].default_rule && usage_type_mapping[infos.usage_name].default_rule[selected_value.value]) {
              document.getElementById('translate-rule').value = usage_type_mapping[infos.usage_name].default_rule[selected_value.value].fr;
              document.getElementById('translated-rule').value = usage_type_mapping[infos.usage_name].default_rule[selected_value.value].en;
            } else {
              document.getElementById('translate-rule').value = "";
              document.getElementById('translated-rule').value = "";
            }
          } else {
            document.getElementById('translate-rule').value = "";
            document.getElementById('translated-rule').value = "";
          }
          break;
      }
  })

}


function isAlreadyExist(id) {

  return new Promise((resolve, reject) => {
    let even = _.find(existingWidgets, function(num){
      return num.id == id;
    });
    resolve(even);
  })

}


function getValueList(id) {

  return new Promise((resolve, reject) => {
    let even = _.find(value_list, function(num){
      return num.periph_id == id;
    });
    if (even) {
      resolve(even);
    } else {
      EEDomusLib.getPeriphValueList(id)
      .then((list) =>  {
        value_list.push(list);
        resolve(list);
      })
      .catch(err => {
        console.log('err', err);
        resolve();
      })
    }
  })
}



function getPeriphByName (name, room) {
    return new Promise((resolve, reject) => {
      let periphs = _.find(periphInfos, function(num){
        return _.keys(num)[0] == room;
      });
      let periph = _.find(periphs[room], function(num){
        return  num.name == name;
      });
      resolve(periph);
    })
}


function searchDuplicatedPeriph() {

  let rooms = [];
  _.each(periphInfos, function(roomInfo) {
      let name = _.keys(roomInfo)[0];
      let names = _.pluck(roomInfo[name], 'name');
      let uniq = _.uniq(names);
      if (names.length != uniq.length) {
        if (rooms.length == 0)
            rooms.push(name);
        else {
            rooms.push(' et ');
            rooms.push(name);
        }
      }
  })

  if (rooms.length > 0) {
    let notification = document.getElementById('notification_small');
    let msg = "ATTENTION: Plusieurs périphériques ont un nom identique dans les pièces suivantes:"
    _.each(rooms, function(room) {
      msg = msg+'<br>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<b>'+room+'</b>';
    })
    msg = msg+"<br>Si un de ces périphériques est à afficher comme widget, corrigez ces doublons avant de poursuivre afin d'éviter un comportement aléatoire sur le widget."
    notification.innerHTML = msg;
    notification.opened = true;
  }

}


function addData() {

  let data = [];
  _.each(periphInfos, function(roomInfo) {
      let name = _.keys(roomInfo)[0];
      let chart = {
          id: name,
          text: name,
          type: 'room',
          state       : {
            opened    : false,  // is the node open
            disabled  : true,  // is the node disabled
            selected  : false  // is the node selected
          },
          children: []
      };

      _.each(roomInfo[name], function(infos) {
        let values = {
          id: infos.periph_id,
          text: infos.name,
          type: 'periph',
          state       : {
            opened    : false,  // is the node open
            disabled  : false,  // is the node disabled
            selected  : false  // is the node selected
          }
        }
        chart.children.push(values);
      })
      data.push(chart);
  });

  return (data);

}



$(document).ready(function() {
  periphInfos = ipcRenderer.sendSync('getEEDomusPeriphs');
  searchDuplicatedPeriph();
  Config = ipcRenderer.sendSync('getEEDomusConf');
  _eeDomusConf = {
   eeUser: Config.API.User,
   eeSecret : Config.API.Secret,
   eeIP : Config.API.IP
 };

 config_widget_save = {
   color: Config.widget.color,
   font: {
     title: Config.widget.font.title,
     value: Config.widget.font.value,
     status: Config.widget.font.status,
   },
   opacity: Config.widget.opacity,
   padding: Config.widget.padding,
   textColor: Config.widget.textColor
 }

  existingWidgets = ipcRenderer.sendSync('getWidgets');
  if (!existingWidgets) {
    let notification = document.getElementById('notification');
    notification.innerHTML = "Erreur, impossible de récupérer les Widgets"
    notification.opened = true;
    existingWidgets = [];
  }

  EEDomusLib = require('../../node_modules/lib-avatar/eedomus').init(_eeDomusConf);
  if (fs.existsSync(path.normalize(__dirname+'/../usage/periphUsage.json'))) {
      usage_type_mapping = fs.readJsonSync(path.normalize(__dirname+'/../usage/periphUsage.json'), { throws: false });
  }
  init();
})
