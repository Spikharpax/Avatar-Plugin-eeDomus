const request = require('request');
const _ = require('underscore');
const fs = require('fs-extra');
const klawSync = require('klaw-sync');
const path = require('path');
const cron = require('cron').CronJob;
const {Graph} = require('cyto-avatar');
const {remote, ipcRenderer} = require('electron');
const {Menu, BrowserWindow, ipcMain} = remote;
const {CreateWidget} = require('widget-avatar');
const moment = require('moment');
let Widget = new CreateWidget ();

// module get set eedomus
Avatar.EEDomusLib = require('./node_modules/lib-avatar/eedomus').init();
// module fonctions accessibles partout
Avatar.Functions = require('./node_modules/lib-avatar/functions').init();

// graph interface
let cyto;
// Liste des périphériques classée par pièces
let periphInfos;
// ID fenetre périphériques
let eeDomusWindow;
// menu cytoscape
let menu;
// cron clic dbl-clic
let switchClic;
// si une action est en cours, pas d'autre action possible (true, false)
let current_action;
// Suppression automatique du menu
let destroyMenu;

// Non documenté
// Fonction exécutée avant l'affichage des nodes dans l'interface Avatar
// Permet d'ignorer des classes à ne pas redimensionner pendant le sizing du DOM
// Passer un array avec 'ALL' pour ignorer tous les nodes (y compris les nodes serveur et clients)
// ou un tableau avec les classes de nodes
// ex: callback (['eeDomusWidget']);  ou callback (['ALL']);
// ou callback (['eeDomusWidget', 'ALL']); => ignore tout, le 'ALL' est prioritaire
exports.unresize = function(callback) {
  callback (['eeDomusWidget', "eeDomusNode"]);
}


// Sauvegarde du node et des widgets lorsqu'on quitte Avatar
exports.onAvatarClose = function(callback){
  if (cyto)
    cyto.saveAllGraphElements("eeDomusNode")
    .then(() => Widget.saveAll(cyto, "eeDomusWidget"))
    .then(() => {
      callback();
    })
    .catch(err => {
      console.log('Error saving Elements', err)
      callback();
    })
}


exports.init = function(){

	// table of properties
	 _eeDomusConf = {
		eeUser: Config.modules.eeDomus.API.User || '',
		eeSecret : Config.modules.eeDomus.API.Secret || '',
		eeIP : Config.modules.eeDomus.API.IP || ''
	};

  // Démarrage autoUpdate des Widgets
  startautoUpdateWidgets();
}



exports.action = function(data, callback){

  // Test configraton
  if (!_eeDomusConf.eeUser || !_eeDomusConf.eeSecret || !_eeDomusConf.eeIP) {
		warn("eeDomus:", "Configuration manquante pour la box domotique. Ouvrez et suivez la documentation.");
	  if (data.client)
    Avatar.Speech.end(data.client);
    return callback();
	}

  // IMPORTANT pour l'ajout de fonction: Ne pas modifier la ligne suivante !
	let tblCommand = {
    // Fonction par défaut: Reçoit l'information du périphérique
    get: function() {
      if (Config.modules.eeDomus.clients[room][data.action.periph]) {
          eeDomus_get(Config.modules.eeDomus.clients[room][data.action.periph])
          .then(info => {
            if (data.action.answer) {
              Avatar.speak(data.action.answer.replace('%%', info), data.client, () => {
                Avatar.Speech.end(data.client);
              })
            } else {
              Avatar.speak(info, data.client, () => {
                Avatar.Speech.end(data.client);
              })
            }
          })
          .catch(err => {
        		console.log('err eeDomus:', err); // F11
            error('Erreur, impossible d\'exécuter la commande eeDomus');
            Avatar.Speech.end(data.client);
        	})
      } else
				Avatar.speak("Je n'ai pas trouvé le périphérique de cette pièce", data.client, function() {
					Avatar.Speech.end(data.client);
				});
    },
    // Fonction par défaut: Envoie la valeur vers le périphérique
		set: function() {
      if (Config.modules.eeDomus.clients[room][data.action.periph]) {
        Avatar.speak(Config.modules.eeDomus.answers, data.client, () => {
          if (data.action.macro) {
              let macro_id = getMacroIDByNotes(Config.modules.eeDomus.clients[room][data.action.periph], data.action.value)
              if (macro_id) {
                Avatar.EEDomusLib.macro(macro_id)
                .then(() => {
                    Avatar.Speech.end(data.client);
                })
                .catch(err => {
                  console.log('err eeDomus:', err);
                  error('Erreur, impossible d\'exécuter la commande eeDomus');
                  Avatar.Speech.end(data.client);
                })
                return;
              }
            }

            eeDomus_action (Config.modules.eeDomus.clients[room][data.action.periph], data.action.value)
            .then(() => {
              Avatar.Speech.end(data.client);
            })
            .catch(err => {
              console.log('err eeDomus:', err); // F11
              error('Erreur, impossible d\'exécuter la commande eeDomus');
              Avatar.Speech.end(data.client);
            })

        })
      } else
				Avatar.speak("Je n'ai pas trouvé le périphérique de cette pièce", data.client, function() {
					Avatar.Speech.end(data.client);
				});
		},
    // Fonction connecteur HTTP box eeDomus, recoit l'information du périphérique quand il change de valeur
    updateWidget : function() {
			updateWidget(data.action);
		}
	};

	let room = setClient(data);
  if (data.action.command != 'updateWidget') // pour eviter d'encombrer les messages serveur
	 info("eeDomus:", data.action.command, "From:", data.client, "To:", room);
	tblCommand[data.action.command]();
	callback();
}


// Méthode de recherche du client où l'action doit être exécutée.
function setClient (data) {

	var client = data.client;

	if (data.action.room)
		client = (data.action.room != 'current') ? data.action.room : (Avatar.currentRoom) ? Avatar.currentRoom : Config.default.client;

	if (data.action.setRoom)
		client = data.action.setRoom;

	return client;
}


// Non documenté mais OBLIGATOIRE pour ce plugin !
// Fonction exécutée avant l'affichage des menus contextuels des nodes dans l'interface Avatar
// Ici on supprime le menu créé par 'cytoscape-cxtmenu' sinon tous les nodes Avatar auraient ce menu
// il est rechargé à chaque instance de addCytoMenu()
exports.beforeNodeMenu  = function(CY, cytoscape) {
	if (menu) {
		menu.destroy();
		menu = null;
	}
}

// Ajout du node et des widgets eeDomus à l'ouverture d'Avatar
exports.addPluginElements = function(CY,cytoscape) {

  if (!_eeDomusConf.eeUser || !_eeDomusConf.eeSecret || !_eeDomusConf.eeIP) {
		warn("eeDomus:", "Configuration manquante pour la box domotique. Ouvrez et suivez la documentation.");
		return;
	}

  try {
    let cxtmenu = require('cytoscape-cxtmenu');
    cytoscape.use(cxtmenu);
  } catch (err) {}

  Avatar.EEDomusLib.getPeriphInfos()
  .then(infos => {
    return new Promise((resolve, reject) => {
      periphInfos = infos;
      resolve();
    })
  })
  .then(() => getPeriphRooms ())
  .then (rooms => classPeriphByRooms (rooms))
  .then (infos => {
    periphInfos = infos;
    Avatar.Functions.addperiphInfos(periphInfos);
  })
  .catch(err => {
		console.log('err:', err || 'Erreur dans la recherche des périphériques eeDomus');
	})

  // init variables globales module Widget
  Widget.init(CY, __dirname, Config.modules.eeDomus);

  //init variable globale module Graph
  cyto = new Graph (CY, __dirname, Config.modules.eeDomus);

  // Chargement des éléments sauvegardés
  cyto.loadAllGraphElements()
  .then(elems => {
    if (!elems || elems.length == 0) {
      addEEDomusNode(cyto)
      .then(elem => cyto.onClick(elem, (evt) => {
          windowShow();
      }))
      .then(() => Widget.loadAll(cyto))
      .then(widgets => {
          addOnClick (CY, widgets);
      })
      .catch(err => {
        console.log('err:', err || 'erreur à la création du node eeDomus');
      })
    } else {
      if (Config.modules.eeDomus.node.label)
        cyto.addElementLabelOnly(elems[0], "eeDomus")

      cyto.onClick(elems[0], (evt) => {
          windowShow();
      })
      .then(() => Widget.loadAll(cyto))
      .then(widgets => {
          addOnClick (CY, widgets);
      })
      .catch(err => {
        console.log('err:', err || 'erreur à la création du node eeDomus');
      })
    }
  })
  .catch(err => {
    console.log('err:', err || 'erreur à la création du node eeDomus');
  })

}


function addOnClick (CY, widgets, isNode) {

    function onclic (widget) {
      switch (widget.parent().data('type')) {
        case 'list':
            cyto.onClick(widget, (evt) => {
                ctxtap(CY, widget);
            })
          break;
        case 'string':
        case 'float':
            cyto.onClick(widget, (evt) => {
              setTimeout(() => {
                if (!widget.parent().data('byBox')) {
                  Avatar.Functions.refreshWidgetInfos(cyto, widget, widget.parent().id(), widget.parent().data('usage'))
                  .catch(err => {
                    error('Impossible de rafraichir les informations du widget');
                    console.log('refresh widget', err);
                  })
                } else {
                  widget.parent().data('byBox', false)
                }
              }, Config.modules.eeDomus.widget.latency);
            })
          break;
      }
    }

    if (isNode)
      onclic(widgets);
    else
      widgets.forEach(function(widget) {
        onclic(widget);
      })

}


// Supression automaitque du menu après un timeout
// Pour ne pas laisser un menu cytoscape qui traine...
function destroy_menu() {

  if (destroyMenu) {
    destroyMenu.stop();
    destroyMenu = null;
  }

  let d = new Date();
  let s = d.getSeconds()+Config.modules.eeDomus.widget.menu.timeOut;
  d.setSeconds(s);
  destroyMenu = new cron(d, function(done) {
    if (menu) {
      if (menu) menu.destroy();
      menu = null;
      destroyMenu = null;
      return;
    }
  },null, true);

}


function ctxtap (CY, widget) {

  if (menu || current_action) {
    if (menu) menu.destroy();
    menu = null;
    current_action = null;
    return;
  }

  // Si click intérrupteur = 0 et qu'il y a un menu alors on l'affiche direct, pas de double click
  if (widget.parent().data('dblclick_values').length > 0 && widget.parent().data('click_values').length == 0) {
    current_action = true;
    addCytoMenu(CY, widget, widget.parent().data('dblclick_values'));
  } else  if (widget.parent().data('dblclick_values').length == 0 && widget.parent().data('click_values').length == 0) {
    current_action = true;

    setTimeout(() => {
      if (!widget.parent().data('byBox')) {
        Avatar.Functions.refreshWidgetInfos(cyto, widget, widget.parent().id(), widget.parent().data('usage'))
        .then(() => {
          current_action = false;
        })
        .catch(err => {
          error('Impossible de rafraichir les informations du widget');
          console.log('refresh widget', err)
          current_action = false;
        })
      } else {
        widget.parent().data('byBox', false)
      }
    }, (widget.parent().data('macro') == true) ? Config.modules.eeDomus.widget.latency_macro : Config.modules.eeDomus.widget.latency);

  } else if (!switchClic) { // sinon si pas de timer en cours...
    let d = new Date();
  	let s = d.getSeconds()+Config.modules.eeDomus.widget.menu.doubleClickTime;
  	d.setSeconds(s);
  	switchClic = new cron(d, function(done) {
        // Si pas double cliqué dans la seconde alors simple click
        switchClic.stop();
        switchClic = null;
        if (widget.parent().data('click_values').length > 0) {
          current_action = true;
          onClick (widget);
        }
  	},null, true);
  } else {
      // Si pas null alors double cliqué
      switchClic.stop();
      switchClic = null;
      if (widget.parent().data('dblclick_values').length > 0) {
        current_action = true;
        addCytoMenu(CY, widget, widget.parent().data('dblclick_values'));
      }
  }
}


function onClick (widget) {

  let periph_id = widget.parent().id();
  Avatar.EEDomusLib.getPeriphCaract(periph_id)
  .then(current_values => {
      return new Promise((resolve, reject) => {
          let value = _.reject(widget.parent().data('click_values'), function(num) {
            return num.description == current_values.last_value_text;
          });
          if (value.length == 0) {
              return resolve(false);
          }
          widget_action(widget, value[0].value, status => {
            resolve(status);
          });
     })
  })
  .then(status => {
      if (status) {

          // nouvelles valeurs pour le widget
          setTimeout(() => {
            if (!widget.parent().data('byBox')) {
              Avatar.Functions.refreshWidgetInfos(cyto, widget, periph_id, widget.parent().data('usage'))
              .then(() => {
                current_action = false;
              })
              .catch(err => {
                error('Impossible de rafraichir les informations du widget');
                console.log('refresh widget', err)
                current_action = false;
              })
            } else {
              widget.parent().data('byBox', false)
            }
          }, (widget.parent().data('macro') == true) ? Config.modules.eeDomus.widget.latency_macro : Config.modules.eeDomus.widget.latency);

      } else {
        error('Impossible d\'exécuter l\'action pour le widget');
        current_action = false;
      }
  })
  .catch(err => {
    error('Impossible d\'exécuter l\'action pour le widget');
    current_action = false;
  })
}


function addCytoMenu (CY, elem, dblclick_values) {

		let defaults = {
		  menuRadius: Config.modules.eeDomus.widget.menu.radius, // the radius of the circular menu in pixels
		  selector: 'node',
		  commands: [],
			fillColor: elem.style('background-color'), //'rgba(255, 138, 0, 0.75)', // the background colour of the menu
		  activeFillColor: Config.modules.eeDomus.widget.menu.activeFillColor, // the colour used to indicate the selected command
		  activePadding: 0, // additional size in pixels for the active command
		  indicatorSize: 18, // the size in pixels of the pointer to the active command
		  separatorWidth: 0, // the empty spacing in pixels between successive commands
		  spotlightPadding: 2, // extra spacing in pixels between the element and the spotlight
		  minSpotlightRadius: 12, // the minimum radius in pixels of the spotlight
		  maxSpotlightRadius: 38, // the maximum radius in pixels of the spotlight
		  openMenuEvents: 'tap', // space-separated cytoscape events that will open the menu; only `tap` work here
		  itemColor: elem.style('color'), // the colour of text in the command's content
		  itemTextShadowColor: 'transparent', // the text shadow colour of the command's content
		  zIndex: 9999, // the z-index of the ui div
		  atMouse: false // draw menu at mouse position
		};

		setMenuCommands (elem, dblclick_values, defaults, (defaults) => {
			// Création du menu

      // Modification de la taille de police du menu circulaire dans un timeout à 0 sinon ca marche pas...
      // va comprendre...
      setTimeout(function(){
        let allctxValues = document.getElementsByClassName('cxtmenu-content');
        for (var i = 0; i < allctxValues.length; i++) {
            allctxValues[i].offsetParent.style.fontSize = Config.modules.eeDomus.widget.menu.font;
        }
      }, 0);
			menu = CY.cxtmenu(defaults);

      // démarrage du timeout pour supprimer le menu si celui-ci n'est pas utilisé
      destroy_menu();
		})

}


// Test de mise à jour du widget
// Non utilisé, remplacé par un flag "byBox", plus simple...
function isToUpdate (last_value_change) {
  if (last_value_change) {
    let diff = Math.abs(moment().diff(last_value_change.replace(' ','T'), 'seconds'));
    return (diff >= Config.modules.eeDomus.widget.upToDate) ? true : false;
  } else
    return true;
}


// Definition des actions du menu circulaire
function setMenuCommands (elem, dblclick_values, defaults, callback) {

  // On inverse La liste des valeurs pour affichage
  dblclick_values = _.chain(dblclick_values).reverse().value();
  for (let value in dblclick_values) {
			let command = {
					content: dblclick_values[value].description,
					select: function(ele) {
            widget_action(elem, dblclick_values[value].value, state => {
              if (menu) {
                menu.destroy();
  						  menu = null;
              }

              if (state) {
                setTimeout(() => {
                  if (!elem.parent().data('byBox')) {
                    Avatar.Functions.refreshWidgetInfos(cyto, elem, elem.parent().id(), elem.parent().data('usage'))
                    .then(() => {
                      current_action = false;
                    })
                    .catch(err => {
                      error('Impossible de rafraichir les informations du widget');
                      console.log('refresh widget', err)
                      current_action = false;
                    })
                  } else {
                    elem.parent().data('byBox', false)
                  }
                }, (elem.parent().data('macro') == true) ? Config.modules.eeDomus.widget.latency_macro : Config.modules.eeDomus.widget.latency);
              } else {
                error('Impossible d\'exécuter l\'action pour le widget');
                current_action = false;
              }
            });
					}
			};
			defaults.commands.push(command);
	}
	callback(defaults);
}


function getMacroIDByNotes(periph_id, value) {
  let notes;
  for(let room in periphInfos) {
    _.each(periphInfos[room], function(num){
      for (let i=0; i<num.length && !notes; i++) {
        if (num[i].periph_id == periph_id) {
          if (num[i].notes) {
            notes = num[i].notes;
            break;
          }
        }
      };
    });
  }
  if (notes) {
      notes = notes.split(',');
      let id;
      for(let i=0; i<notes.length && !id; i++) {
          if (notes[i] == value && notes[i+1]) {
            id = notes[i+1];
            break;
          }
      }
      return (id) ? id : null;
  } else
    return null;
}


// Action (uniquement "list")
function widget_action(elem, value, callback) {

  if (!elem.parent().data('type'))
    return error("Le widget n'a pas de type, impossible d'exécuter l'action.")

  switch (elem.parent().data('type')) {
  case 'list':
      if (elem.parent().data('macro') == true) {
        let macro_id = getMacroIDByNotes(elem.parent().id(), value)
        if (macro_id) {
          Avatar.EEDomusLib.macro(macro_id)
          .then(() => {
            elem.data('last_value', value);
            if (callback) callback(true);
          })
          .catch(err => {
            error("L'action eeDomus a échouée:", err);
            if (callback) callback(false);
          })
          break;
        }
      }
      Avatar.EEDomusLib.set(elem.parent().id(), value)
      .then(() => {
        // conserve la dernière valeur cliquée
        elem.data('last_value', value);
        if (callback) callback(true);
      })
      .catch(err => {
        error("L'action eeDomus a échouée:", err);
        if (callback) callback(false);
      })
      break;
   default:
    if (callback) callback(false);
    break;
  }
}


// Mise à jour widget provenant d'un connecteur HTTP box domotique
function updateWidget(data) {
  cyto.getGraphElementByName(data.periph_id+'_img')
  .then(widget => {
    if (widget) {
      // Flag pour savoir si c'est mis à jour par la box
      widget.parent().data('byBox', true);
      Avatar.Functions.refreshWidgetInfos (cyto, widget, data.periph_id, widget.parent().data('usage'));
    } else
      warn("Le widget pour le périphérique "+data.periph_id+" n'existe pas");
  })
  .catch(err => {
    console.log('updateWidget:', err);
    error("Impossible de mettre à jour le widget:", err);
  })

}



function addEEDomusNode(cyto) {

    return new Promise((resolve, reject) => {
      cyto.getGraph()
      .then(cy => cyto.addGraphElement(cy, "eeDomusNode"), null, true)
      .then(elem => cyto.addElementName(elem, "eeDomus"))
      .then(elem => {
        return new Promise((resolve, reject) => {
          if (Config.modules.eeDomus.node.label)
            cyto.addElementLabelOnly(elem, "eeDomus")
          resolve(elem);
        })
      })
      .then(elem => cyto.addElementClass(elem, "eeDomusNode"))
      .then(elem => cyto.addElementImage(elem, __dirname+"/assets/images/eeDomus.png"))
      .then(elem => cyto.addElementSize(elem, {width: 45, height: 45}))
      .then(elem => cyto.addElementPosition(elem, {x:100, y:100}))
      .then(elem => {
          resolve(elem);
      })
      .catch(err => {
        reject();
      })
    })
}


function windowShow () {

  if (eeDomusWindow) {
    eeDomusWindow.show();
    return;
  }

  let id = ipcRenderer.sendSync('info', 'id');
  let win = BrowserWindow.fromId(id);
  let style = {
    parent: win,
    frame: true,
    movable: true,
    resizable: false,
    show: false,
    width: 735,
    skipTaskbar: false,
    height: 535,
    title: 'Périphériques eeDomus',
    icon: 'resources/core/plugins/eeDomus/assets/images/eeDomus.png',
  }

  eeDomusWindow = new BrowserWindow(style);
  eeDomusWindow.loadFile('../core/plugins/eeDomus/assets/html/eeDomus.html');
  //eeDomusWindow.openDevTools();
  ipcRenderer.sendSync('addPluginWindowID', eeDomusWindow.id);
  eeDomusWindow.once('ready-to-show', () => {
      eeDomusWindow.show();
  });
  eeDomusWindow.on('closed', () => {
    ipcMain.removeAllListeners('eeDomus');
    ipcMain.removeAllListeners('geteeDomusID');
    ipcMain.removeAllListeners('getEEDomusPeriphs');
    ipcMain.removeAllListeners('getWidgets');
    ipcMain.removeAllListeners('getEEDomusConf');
    ipcMain.removeAllListeners('manage_eeDomus_node');
    ipcMain.removeAllListeners('save_eeDomusConfig');
    ipcMain.removeAllListeners('save_eeDomusFullConfig');
    eeDomusWindow = null;
  });

  ipcMain.on('geteeDomusID', (event, arg) => {
    event.returnValue = eeDomusWindow.id;
  })
  .on('getEEDomusPeriphs', (event, arg) => {
    event.returnValue = periphInfos;
  })
  .on('getEEDomusConf', (event, arg) => {
    event.returnValue = Config.modules.eeDomus;
  })
  .on('save_eeDomusFullConfig', (event, arg) => {
    Config.modules.eeDomus = arg;
    Avatar.Functions.saveConfig(arg)
    .then(() => {
      event.returnValue = true;
    })
    .catch(err => {
      console.log('err', err)
      event.returnValue = false;
    })
  })
  .on('save_eeDomusConfig', (event, arg) => {
    if (!arg.id) { // config globale
      Config.modules.eeDomus.widget = arg;
      Avatar.Functions.saveConfig(Config.modules.eeDomus)
      .then(() => {
        event.returnValue = true;
      })
      .catch(err => {
        console.log('err', err)
        event.returnValue = false;
      })
    } else { // spécifique à un seul widget
      Widget.saveSpecificStyle(cyto, "eeDomusWidget", arg.id, arg)
      .then(() => {
        event.returnValue = true;
      })
      .catch(err => {
        console.log('err', err)
        event.returnValue = false;
      })
    }
  })
  .on('getWidgets', (event, arg) => {
      Widget.getWidgets(cyto, "eeDomusWidget")
      .then(infos => {
        event.returnValue = infos;
      })
      .catch(err => {
        console.log('err', err)
        event.returnValue = false;
      })
  })
  .on('manage_eeDomus_node', (event, arg) => {
    switch (arg.action) {
      case 'create':
        Avatar.EEDomusLib.getPeriphCaract(arg.periph_id)
        .then(current_values => {
            return new Promise((resolve, reject) => {
              arg.title = arg.title.replace(" "+arg.room,'').replace(" "+arg.room,'').replace(" "+arg.room,'');
              let diff = moment().diff(current_values.last_value_change.replace(' ','T'), 'seconds');
              arg.value = current_values.last_value_text ? current_values.last_value_text : current_values.last_value;
              arg.status = Avatar.Functions.timeConvert(diff);
              arg.unit = current_values.unit ? current_values.unit : "";
              arg.img = null;
              arg.last_value = current_values.last_value;
              resolve(arg);
           })
        })
        .then(arg => {
          return new Promise((resolve, reject) => {
            if (arg.type == 'list' && arg.click_values.length == 0 && arg.dblclick_values.length == 0) {
                Avatar.EEDomusLib.getPeriphValueList(arg.periph_id)
                .then((list) =>  {
                  arg.click_values = list.values;
                  arg.click_values_added = true;
                  resolve(arg);
                })
            } else {
              resolve(arg);
            }
          })
        })
        .then(arg => {
          return new Promise((resolve, reject) => {
            create_widget(arg)
            .then(widget => {
              Avatar.Functions.getImageSync(arg.usage, arg.periph_id, arg.value, null, widget.parent())
              .then(img => cyto.addElementImage(widget, img))
              .then(() => {
                if (arg.click_values_added) {
                  widget.parent().data('click_values', []);
                }
                event.returnValue = true;
              })
            })
          })
        })
        .catch(err => {
          event.returnValue = false;
        })
        break;
      case 'delete':
        Widget.deleteWidget(cyto, arg.periph_id, arg.classname)
        .then(() => Avatar.Functions.removeWidgetInfos(arg.periph_id))
        .then(() => {
          event.returnValue = true;
        })
        .catch(err => {
          event.returnValue = false;
        })
        break;
      case 'deleteAllWidgets':
        Widget.deleteAllWidgets(cyto, arg.classname)
        .then(() => Avatar.Functions.removeAllWidgetInfos())
        .then(() => {
          event.returnValue = true;
        })
        .catch(err => {
          event.returnValue = false;
        })
        break;
      case 'test':
        Widget.testSpecificStyle(cyto, arg.classname, arg.style, arg.padding)
        .then(() => {
          event.returnValue = true;
        })
        .catch(err => {
          event.returnValue = false;
        })
        break;
      case 'getImages':
        Avatar.Functions.getImages (arg)
        .then(files => {
          event.returnValue = files;
        })
        .catch(err => {
          event.returnValue = [];
        })
        break;
      case 'getImage':
        Avatar.Functions.getImageSync(arg.usage, arg.periph_id, arg.value, arg.values)
        .then(file => {
          event.returnValue = file;
        })
        .catch(err => {
          event.returnValue = false;
        })
        break;
      case 'newImage':
        Widget.newImage(cyto, arg)
        .then(() => {
          event.returnValue = true;
        })
        break;
      case 'delete_image':
        Avatar.Functions.deletePersonnalizedImage(arg.usage, arg.periph_id)
        .then(() => {
          event.returnValue = true;
        })
        .catch(err => {
          event.returnValue = false;
        })
        break;
      case 'translate':
        Avatar.translate(arg.text, (translated) => {
          if (translated.text) {
            let rawSentence = arg.text;
            if (translated.from.text.autoCorrected)
              rawSentence = translated.from.text.value.replace(/\[/g,'').replace(/\]/g,'');

            Avatar.ia.action(rawSentence, 'TranslateByInterface', (state) => {
              state.translated = translated;
              event.returnValue = state;
            });
          } else
            event.returnValue = null;
        });
        break;
    }
  })
  .on('eeDomus', (event, arg) => {
    switch (arg) {
      case 'quit':
        let state = ipcRenderer.sendSync('removePluginWindowID', eeDomusWindow.id);
        event.returnValue = true;
        eeDomusWindow.close();
        break;
    }
  })

}


// Création des widgets avec valeurs par défaut
function create_widget(params) {
  return new Promise((resolve, reject) => {
    let isWrap = Avatar.Functions.getSizing (params.value);
    Widget.create(cyto, {
                          id: params.periph_id,
                          class: params.class,
                          title: params.title,
                          value: params.value,
                          macro: params.macro,
                          isWrap: isWrap,
                          click_values: params.click_values,
                          dblclick_values: params.dblclick_values,
                          usage: params.usage,
                          status: params.status,
                          unit: params.unit,
                          type: params.type,
                          style: {
                            image: {
                              path: params.img,
                              size: {
                                width: 40,
                                height: 40
                              },
                              pos: {
                                x: 75,
                                y: 130
                              }
                            },
                            title: {
                              size: {
                                width: 100,
                                height: 7
                              },
                              pos: {
                                x: 100,
                                y: 100
                              }
                            },
                            value: {
                              size: {
                                width: (params.type == 'list') ? 25 : 45,
                                height: 20
                              },
                              pos: {
                                x: (isWrap.sizing) ? 130 : 125,
                                y: 130
                              }
                            },
                            status: {
                              size: {
                                width: 100,
                                height: 4
                              },
                              pos: {
                                x: 100,
                                y: 160
                              }
                            }
                          }
                        })
    .then(widget => {
      cyto.getGraph()
      .then(cy => {
          addOnClick (cy, widget, true);
          resolve(widget);
      })
    })
    .catch(err => {
      reject(err);
    })
  })
}



function startautoUpdateWidgets () {
  if (Config.modules.eeDomus.widget.autoUpdate.start == true) {
    info('eeDomus: Mise à jour automatique des Widgets toutes les '+Config.modules.eeDomus.widget.autoUpdate.delay+' minutes démarrée')
    let widgetCron = new cron('*/'+Config.modules.eeDomus.widget.autoUpdate.delay+' * * * *', function(done) {
      Widget.getWidgets(cyto, "eeDomusWidget")
      .then(existingWidgets => {
          if (existingWidgets && existingWidgets.length > 0) {
              Avatar.EEDomusLib.getPeriphCaract('all')
              .then(periphsCaract => searchWidgetInfos(existingWidgets, periphsCaract))
              .then(widgetsToUpdate => {
                if (widgetsToUpdate.length > 0) {
                  _.each(widgetsToUpdate, function(toUpdate) {
                    cyto.getGraphElementByName(toUpdate.periph_id+'_img')
                    .then(widget => {
                        Avatar.Functions.refreshWidget (cyto, widget, toUpdate.periph_id, widget.parent().data('usage'), toUpdate);
                    })
                    .catch(err => {
                      console.log('Mise à jour automatique des Widgets:', err);
                      error("Impossible de mettre à jour le widget:", toUpdate.periph_id);
                    })
                  })
                }
              })
              .catch(err => {
                console.log('err', err)
                error('Impossible de récupérer les périphériques eeDomus');
              })
          }
      })
      .catch(err => {
        console.log('err', err)
        error('Impossible de récupérer les widgets');
      })
    },null, true);
  }
}


function searchWidgetInfos (existingWidgets, periphsCaract) {
  return new Promise((resolve, reject) => {
      let widgetToUpdate = [];
      for(let i=0; i<existingWidgets.length; i++) {
          let even = _.find(periphsCaract, function(num){
            return num.periph_id == existingWidgets[i].id;
          });
          if (even)
            widgetToUpdate.push(even);
          if (i+1 == existingWidgets.length)
            resolve(widgetToUpdate);
      }
  })
}



function eeDomus_action (periph_id, value) {
  return new Promise((resolve, reject) => {
      Avatar.EEDomusLib.set(periph_id, value)
      .then(() => {
        resolve();
      })
      .catch(err => {
        reject(err);
      })
  })
}


function eeDomus_macro (periph_id) {
  return new Promise((resolve, reject) => {
      Avatar.EEDomusLib.macro(periph_id)
      .then(() => {
        resolve();
      })
      .catch(err => {
        reject(err);
      })
  })
}


function eeDomus_get (periph_id) {
  return new Promise((resolve, reject) => {
      Avatar.EEDomusLib.getPeriphCaract(periph_id)
      .then(infos => {
        if (infos.last_value)
          resolve(infos.last_value);
        else
          resolve(infos.last_value_text);
      })
      .catch(err => {
        reject(err);
      })
  })
}

// retourne le client dans lequel le périphérique se trouve (eeDomus.prop)
function getRoom (key) {
  let client;
   for(let room in Config.modules.eeDomus.clients) {
     for (let periph in Config.modules.eeDomus.clients[room]) {
       if (periph == key) {
         client = room;
         break;
       }
     }
     if (client) break;
   }
   return client;
}


function getPeriphById (id, room) {
    return new Promise((resolve, reject) => {
      let periphs = _.find(periphInfos, function(num){
        return _.keys(num)[0] == room;
      });
      let periph = _.find(periphs[room], function(num){
        return  num.periph_id == id;
      });
      resolve(periph);
    })
}


function getPeriphRooms () {
  return new Promise((resolve, reject) => {
      let rooms = _.uniq(_.pluck(periphInfos, 'room_name'));
      resolve(rooms);
  });
}


function getPeriphsByRoom (room) {
  return new Promise((resolve, reject) => {
      let periphsByRoom = _.where(periphInfos, {'room_name': room});
      resolve(periphsByRoom);
  });
}

function classPeriphByRooms (rooms) {
  return new Promise((resolve, reject) => {
    let periphInfos = [];
    _.each(rooms, function(room){
      getPeriphsByRoom (room)
      .then(periphsByRoom => {
        let obj = new Object();
        obj[room] = periphsByRoom;
        periphInfos.push(obj);
      })
    })
    resolve(periphInfos);
  });
}
