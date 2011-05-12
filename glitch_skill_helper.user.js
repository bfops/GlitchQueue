// ==UserScript==
// @name           Glitch Skill Helper
// @include        http://alpha.glitch.com
// @include        http://beta.glitch.com
// @include        http://alpha.glitch.com/
// @include        http://beta.glitch.com/
// @include        http://alpha.glitch.com/#
// @include        http://beta.glitch.com/#
// @description	   Manages skill-queuing for learning in Glitch.
// ==/UserScript==

// Don't change this unless you know what a unit test is, and you want to enable them.
var unittest = true;
var POLL_INTERVAL_DISABLED = 5 * 60; // poll interval when game is disabled
var POLL_INTERVAL_ERROR = 60;	// poll interval when unknown error is encountered, maybe 500 errs

// **************************************************************************
// ------------------------ DO NOT EDIT FROM HERE ON ------------------------
// **************************************************************************

// Returns [b] \ [a] (i.e. all elements in [b] which are not in [a]).
function relativeComplement(a, b) {
	var ret = {};

	for (x in b)
		if(!a[x])
			ret[x] = b[x];

	return ret;
}

if(GM_registerMenuCommand)
	GM_registerMenuCommand("About Glitch Skill Queuer", function() {
		alert("ping's skill queuer for Glitch, modified by RobotGymnast.");
	});

/**
 * unsafeWindow variables / functions
 */
if(unsafeWindow) {
	$ = unsafeWindow.$;
	api_call = unsafeWindow.api_call;
	queue = unsafeWindow.queue;
	time = unsafeWindow.time;
	format_sec = unsafeWindow.format_sec;
	setInterval = unsafeWindow.setInterval;
	clearInterval = unsafeWindow.clearInterval;
	window = unsafeWindow;
}

function API() {
	var apiReturns = {};
	this.call = function(callName, args, handler) {
		if(apiReturns && apiReturns[callName]) {
			log("API call " + callName + " overriden.");
			if(handler) handler(apiReturns[callName]);
		}
		else
			api_call(callName, args, handler);
	}

	this.setAPIReturn = function(apiCallName, apiReturn) {
		apiReturns[apiCallName] = apiReturn;
	}
}

function UnitTestCollection() {
	try {
		function UnitTest(func, name) {
			this.run = function() {
				func(name);
			}
		}

		function test_apiReturns(testName) {
			var testAPI = new API;
			var desired = { "purpleDragon" : { "ofcourse" : 1, "whynot?" : { "excellent" : 12, "12" : "hello" } } };
			var numberReturned = 0;
			var totalNumber = 0;

				for (callName in desired) {
					testAPI.setAPIReturn(callName, desired[callName]);
					testAPI.call(callName, function(ret) {
						if(ret != desired[callName])
							logTestResult(testName, false);
					}.bind(this));
				}

			logTestResult(testName, true);
		}

		function test_addToQueue(testName) {
			var api = new API;
			api.setAPIReturn("skills.listAll", { ok : 1, items : { magic : magicSkill, magic2 : magic2Skill } });
			api.setAPIReturn("skills.listAvailable", { ok : 1, skills : { magic : magicSkill , magic2 : magic2Skill } });
			api.setAPIReturn("skills.listLearning", { ok : 1, learning : {} });

			var testQueue = new QueueInterface(api);
			var magicSkill = { name : "Magic", total_time : 10, remaining_time : 10 };
			var magic2Skill = magicSkill;
			magic2Skill.name = "Magic2";

			window.setTimeout(function() {
				testQueue.skillQueue.addSkillToQueue("magic", function(q1) {
				testQueue.skillQueue.addSkillToQueue("magic2", function(q2) {
					logTestResult(testName, q1 == [magicSkill] && q2 == [magicSkill, magic2Skill]);
				});});
			}.bind(this), 1000);
		}

		var testCompletionNumber = 0;

		function logTestResult(testName, result) {
			log("Test '" + testName + "' " + (result ? "succeeded" : "failed") + ".");

			if(++testCompletionNumber == unittests.length)
				log("Done unit tests.");
		}

		var unittests = [
			new UnitTest(test_apiReturns, "API wrapper return-hooking"),
			new UnitTest(test_addToQueue, "Adding to queue")/*,
			new UnitTest(test_removeFromQueue, "Removing from queue"),
			new UnitTest(test_unlearnedSkill, "Unlearned skill list"),
			new UnitTest(test_skillLoadNoQueue, "Skill being learned on page load, no skill queue"),
			new UnitTest(test_skillLoadQueueFrontLearnable, "Skill being learned on page load, queue with learnable skill"),
			new UnitTest(test_skillLoadQueueMiddleLearnable, "Skill being learned on page load, queue with learnable skill 2"),
			new UnitTest(test_skillLoadQueueNoLearnable, "Skill being learned on page load, queue with no learnable skills"),
			new UnitTest(test_noSkillLoadNoQueue, "Page load with no queue"),
			new UnitTest(test_noSkillLoadQueueFrontLearnable, "Page load with queue including learnable skill"),
			new UnitTest(test_noSkillLoadQueueMiddleLearnable, "Page load with queue including learnable skill 2"),
			new UnitTest(test_noSkillLoadQueueNoLearnable, "Page load with queue including no learnable skills"),
			new UnitTest(test_skillCompletedNoQueue, "Skill completed, no queue"),
			new UnitTest(test_skillCompletedQueueFrontLearnable, "Skill completed, queue with learnable skill"),
			new UnitTest(test_skillCompletedQueueMiddleLearnable, "Skill completed, queue with learnable skill 2"),
			new UnitTest(test_skillCompletedQueueNoLearnable, "Skill completed, queue with no learnable skills")*/
		];

		$.each(unittests, function(i, test) {
			test.run();
		});
	} catch(error) {
		alert(error.message);
	}
}

// Skill Queue styling
if(GM_addStyle) {
	GM_addStyle('#skillQueue { border-top: 1px solid #C8E1DE; margin-top:10px; margin-bottom: 40px; }');
	GM_addStyle('.skillQueueItem { margin-top:10px; }');
	GM_addStyle('.skillError { border-left: 3px solid #DD8888; color: #DD8888; font-size: 11px; font-style: italic; margin-left: 2px; margin-bottom: 2px; padding: 0 3px 0 3px; display: none; }');
}

function setUpGUI() {
	var skillQueueSelect = $('<select style="margin-right: 10px; margin: left: 10px;" id="skillQueueSelect"></select>');
	var skillQueueDialogueCont = $('<div class="dialog" id="skillQueueDialogueCont"></div>');
	var skillQueueDialogue = $('<div class="dialog-inner" id="skillQueueDialogue">'
		+ '<a class="close" id="skillQueueDialogueclose">Close</a>'
		+ '<h2>Send a skill to Mr. Q!</h2>'
		+ 'Available Skills: '
		+ '</div>');
	var skillQueueAddBtn = $('<a id="skillQueueAddBtn" class="button-tiny button-minor">Add!</a>');
	skillQueueDialogue.append(skillQueueSelect);
	skillQueueDialogue.append(skillQueueAddBtn);
	skillQueueDialogueCont.append(skillQueueDialogue);
	$("body").append(skillQueueDialogueCont);

	skillQueueDialogueCont.hide();
	// bind events
	skillQueueAddBtn.click(function() { queueInterface.skillQueueAddBtn_onClick(); });
	$("#skillQueueDialogueclose").click(function() { queueInterface.hideAddQDialogue(); });

	// Sidebar
	$('.col-side').prepend('<ul id="skillQueue"></ul>');
	$('.col-side').prepend('<h3>Skills Queue</h3>');
	$('.col-side').prepend('<a id="skillQAddLink" href="javascript: void(0);" style="font-size: 11px; font-weight: bold; float: right;">+Add</a>');

	$("#skillQAddLink").click(function() { queueInterface.showAddQDialogue(); });
}

function log(msg) {
	var now = new Date();
	if(!$.isPlainObject(msg))
		msg = now.getHours() + ":" + now.getMinutes() + "." + now.getSeconds() + (now.getHours() > 11 ? "PM" : "AM") + " - " + msg;
	if(window.console) window.console.log(msg);
	if(GM_log) GM_log(msg);
}

/**
 *	Queue class encapsulates queue handling logic
 */
function GlitchQueue(playerTSID, localDb) {
	this.Q_VALUE_KEY = "glitch_SkillQueue_" + this.playerTSID;	// storage key name
	this.availableSkills = {};
	this.unlearnedSkills = {};
	this.db = localDb;

	// explode queue array from storage
	this.getSavedQueue = function() {
		if(window.localStorage.getItem(this.Q_VALUE_KEY))
			return window.localStorage.getItem(this.Q_VALUE_KEY).split(",");
		return [];
	};

	// get/set queue array from/to body
	this.getQueue = function() { return $('body').data("glitchq"); };
	this.setQueue = function(q) { $('body').data("glitchq", q); };

	// persist queue array to storage
	this.saveQueue = function(skillQueue, handler) {
		window.localStorage.removeItem(this.Q_VALUE_KEY);
		window.localStorage.setItem(this.Q_VALUE_KEY, skillQueue.toString());
		this.setQueue(skillQueue);
		if(handler)
			handler();
	};

	// add skill to queue
	this.addSkillToQueue = function(skillId, handler) {
		log("Adding " + this.unlearnedSkills[skillId].name + " to queue.");
		var q = this.getQueue();
		q.push(skillId);
		this.saveQueue(q, handler);
	};

	// removes skill from queue
	this.removeSkillFromQueue = function(skillId, handler) {
		log("Removing " + this.unlearnedSkills[skillId].name + " from queue.");
		var q = this.getQueue();
		q.splice(q.indexOf(skillId), 1);
		this.saveQueue(q, handler);
	};

	// Re-cache available skills, and (if necessary) pass the cache to [handler].
	this.doAvailableSkillsCache = function(api, handler) {
		log("Renewing available skills cache.");
		api.call("skills.listAvailable", { per_page: 1024 }, function(e) {
			if(e.ok && e.skills) {
				this.availableSkills = e.skills;
				if(handler) handler(e.skills);
			}
		}.bind(this));
	}

	// Re-cache unlearnable skills, and (if necessary) pass the cache to [handler].
	this.doUnlearnedSkillsCache = function(api, handler) {
		log("Renewing unlearned skills cache.");
		api.call("skills.listAll", { per_page: 1024 }, function(all) {
			if(all.ok && all.items)
				api.call("skills.listLearned", {}, function(learned) {
					if(learned.ok && learned.skills) {
						this.unlearnedSkills = relativeComplement(learned.skills, all.items);
						if(handler) handler(this.unlearnedSkills);
					}
				}.bind(this));
		}.bind(this));
	}

}	// end: GlitchQueue()

// Handles the queue's interactions with the user, the webpage, and the API.
function QueueInterface(api) {
	// [time] is in seconds.
	this.renewPollTimer = function(time) {
		if(pollQTimer != 0) window.clearTimeout(pollQTimer);
		pollQTimer = window.setTimeout(function() { this.pollJob(); }.bind(this), time * 1000);
	}

	// Set tool tip for skill currently being learnt
	this.setTooltipForCurrentLearning = function() {
		var completeDate = new Date(currentSkillExpires * 1000);

		$('.progress').attr('title', 'Finishing at '
			+ completeDate.getHours() + ':' + completeDate.getMinutes() + (completeDate.getHours() < 12 ? 'am' : 'pm')
			+ ' on ' + completeDate.getFullYear() + '.' + completeDate.getMonth() + '.' + completeDate.getDate());
	}

	/**
	 * Updates UI progress bar for the skill being learnt
	 */
	this.updateSkillQueueProgress = function(skillId) {
		if(this.skillQueue.skillLearning[skillId]) {
			var skill = this.skillQueue.skillLearning[skillId];
			var remaining = currentSkillExpires - time();
			var percentCompleted = (100 - (remaining / skill.total_time * 100));
			$('#' + skillId + '_skill_indicator').show();

			if(remaining > 0) {
				var prefix = "";
				if(remaining <= 5) prefix = 'OMG OMG OMG OMG ';
				else if(remaining <= 10) prefix = 'Almost there! ';
				else if(remaining <= 15) prefix = 'You can do it! ';
				else if(remaining <= 20) prefix = 'Oh, so close... ';

				$('#' + skillId + '_skill_remaining').html(prefix + format_sec(remaining));
				$('#' + skillId + '_skill_indicator').width((100 - (remaining / skill.total_time * 100)) + '%');

				if(uiQTimer) window.clearTimeout(uiQTimer);
				uiQTimer = window.setTimeout(function() { updateSkillQueueProgress(skillId) }, 1000);	// update every 1 second
			} else {
				$('#' + skillId + '_skill_remaining').html('Done!');
				window.clearTimeout(uiQTimer);	// clear the update
				uiQTimer = 0;
				$('#' + skillId + '_skill_indicator').width($('#' + skillId + '_skill_progress').innerWidth());
			}
		}
	}

	/**
	 * Displays skills in queue in sidebar
	 */
	this.displayQueuedItems = function() {
		var q = this.skillQueue.getQueue().slice(0);
		$.each(q, function(index, skill) {
			showSkillInQueue(skill);
		});
	}

	/**
	 * Displays Add Skill dialogue UI - used by +Add link
	 */
	this.showAddQDialogue = function() {
		var skillQueueSelect = $('#skillQueueSelect');
		skillQueueSelect.html("<option value=''>Choose!</option>");
		for (skillId in this.skillQueue.unlearnedSkills) {
			var skill = this.skillQueue.unlearnedSkills[skillId];
			skillQueueSelect.append($('<option style="border-top: dotted 1px #ccc;" value="' + skillId + '">' + skill.name + '</option>'));
		}
		$("#skillQueueDialogueCont").show();
	}

	/**
	 * Hides Add Skill dialogue UI - used by dialogue's close button
	 */
	this.hideAddQDialogue = function() {
		$("#skillQueueDialogueCont").hide();
	}

	/**
	 * Click event handler for the Add button in the Add Skill dialogue
	 */
	this.skillQueueAddBtn_onClick = function() {
		var skillId = $("#skillQueueSelect").val();
		if(skillId) {
			this.skillQueue.addSkillToQueue(skillId, function() { showSkillInQueue(skillId); }.bind(this));

			if(pollQTimer == 0)
				renewPollTimer(1);
		}
	}

	/**
	 * Click event handler for the Remove [X] skill link
	 */
	this.skillQRemoveLink_onClick = function(skillId) {
		this.skillQueue.removeSkillFromQueue(skillId, function() {
			$('#' + skillId + '_skillqueue_item').fadeOut('fast', function() {
				$('#' + skillId + '_skillqueue_item').remove();
			});
			var q = this.skillQueue.getQueue();
			if(q.length == 0) this.pollJob();
		}.bind(this));
	}

	/**
	 * Displays individual skill details in the sidebar queue
	 */
	this.showSkillInQueue = function(skillId) {
		var skill, remaining;
		if(this.skillQueue.availableSkills[skillId]) {
			skill = this.skillQueue.availableSkills[skillId];
			remaining = skill.time_remaining;
		} else {
			skill = this.skillQueue.unlearnedSkills[skillId];
			remaining = skill.total_time;
		}
		var percentCompleted = (100 - (remaining / skill.total_time * 100));

		var skillQItem = $('<li class="skillQueueItem" id="' + skillId + '_skillqueue_item">'
			+ '<div style="display: block; font-weight: bold; padding-bottom: 3px;" class="minor">' + skill.name + '</div>'
			+ '<div id="' + skillId + '_skill_error" class="skillError"></div>'
			+ '<a id="' + skillId + '_skillRemoveLink" title="Remove this skill from the Queue" style="color: #dd6666; font-size: 11px; float: right; display: block; padding-top: 4px;">X</a>'
			+ '<div id="' + skillId + '_skill_progress" class="progress" style="width: 200px; height: 22px; border-width: 2px; border-color: #a7b6bb;">'
			+ '<div id="' + skillId + '_skill_remaining" style="font-size: 11px; position: absolute; left: 0pt; top: 3px; text-align: center; width: 200px;">' + format_sec(remaining) + '</div>'
			+ '<div class="left"></div>'
			+ '<div id="' + skillId + '_skill_indicator" class="indicator" style="height: 22px; width: ' + percentCompleted + '%; display: ' + (percentCompleted > 0 ? "block" : "none") + ';">'
			+ '</div>'
			+ '</div>'
			+ '</li>').hide();
		$('#skillQueue').append(skillQItem);
		$('#'+ skillId + '_skillRemoveLink').click(function() { skillQRemoveLink_onClick(skillId); }.bind(this));
		skillQItem.fadeIn('slow');
	}

	/**
	 * Submit skill for learning
	 */
	this.submitSkill = function(skillId, handler) {
		api.call("skills.learn", { 'skill_id' : skillId }, function(e) {
			if(e.ok) {
				this.skillQueue.skillLearning[skillId] = this.skillQueue.availableSkills[skillId];
				if(uiQTimer) window.clearTimeout(uiQTimer);
				uiQTimer = window.setTimeout(function() { updateSkillQueueProgress(skillId); }, 1000);
			}
			if(handler) handler(e);
		}.bind(this));
	}

	/**
	 * Massively too convulated polling job
	*/
	this.currentSkillExpires = 0;	// Completetion datetime (secs since epoch) of the current learning skill
	this.pollJob = function() {
		log("Checking skill status...");

		var q = this.skillQueue.getQueue();

		// Rotates the queue until a learnable skill is reached. Returns true iff there is a learnable skill in the queue.
		function rotateQueueToLearnableSkill() {
			// move all unlearnable skills to the end of the queue
			var unlearnableCount = 0;
			for(; unlearnableCount < q.length && !this.skillQueue.availableSkills[q[0]]; ++unlearnableCount) {
				var skillId = q[0];
				// move the skill to the end of the queue.
				this.skillQueue.removeSkillFromQueue(skillId);
				this.skillQueue.addSkillToQueue(skillId);
			}

			return (unlearnableCount < q.length);
		}

		function trySkillSubmit(skillId) {
			submitSkill(skillId, function(e) {	// handle submit skill sucess/failure
				if(e.ok) {	// submitted successfully
					this.skillQueue.removeSkillFromQueue(skillId);
					$('#' + skillId + '_skill_error').html('');
					$('#' + skillId + '_skill_error').hide();
					$('#' + skillId + '_skillRemoveLink').hide();
					currentSkillExpires = this.skillQueue.availableSkills[skillId].time_remaining + time();
					renewPollTimer(this.skillQueue.availableSkills[skillId].time_remaining);
				} else {
					currentSkillExpires = 0;
					var skillError = $('#' + skillId + '_skill_error');
					if(e.error == "The game is disabled.") { // Argh game is disabled
						log("Game is disabled. Checking again in " + (POLL_INTERVAL_DISABLED / 60) + " minutes.");
						skillError.html('Game is disabled.');
						renewPollTimer(POLL_INTERVAL_DISABLED);	// try again later
					} else {
						skillError.html('Error: ' + e.error);
						renewPollTimer(POLL_INTERVAL_ERROR);	// try again later for unknown error
	        			}
					skillError.fadeIn('slow');
				}
			}.bind(this));	// end: submitSkill(q[0], function(e) {
		}

		api_call("skills.listLearning", {}, function(e) {
			if(!e.ok) { log("Oops, poll broke while trying to check learning. " + e.error); return; }

			if(e.learning) {
				for (skillId in e.learning) {
					// Another skill was selected outside of this script.
					var skill = e.learning[skillId];
					var remaining = skill.time_remaining;
					log("Skill " + skill.name + " selected outside of this script. Checking back in " + Math.round(remaining / 60) + " minutes.");
					currentSkillExpires = time() + remaining;
					// Poll once the skill is done.
					renewPollTimer(remaining);

					return;
				}
			}

			log("No skills are being learned.");

			// Refresh both caches.
			this.skillQueue.doUnlearnedSkillsCache(api);
			this.skillQueue.doAvailableSkillsCache(api, function(x) {
				if(q.length > 0 && rotateQueueToLearnableSkill()) trySkillSubmit(q[0]);
			}.bind(this));

		}.bind(this));	// end: api.call("skills.listLearning", {}, function(e) {

	} // end: pollJob()

	if(!api)
		api = new API;

	this.uiQTimer = 0;
	this.pollQTimer = 0;

	this.playerTSID = $('#nav-profile > a').attr('href').split("/")[2];
	if(!this.playerTSID) return;

	this.skillQueue = new GlitchQueue(this.playerTSID);
	// Display the queue after creating both caches.
	this.skillQueue.doUnlearnedSkillsCache(api, function(x) {
	this.skillQueue.doAvailableSkillsCache(api, function(x) { this.displayQueuedItems(); }.bind(this));}.bind(this));

	$('body').data("glitchq", this.skillQueue.getSavedQueue());

	this.pollJob();

} // end: QueueInterface()

var queueInterface = {};

$(document).ready(function() {
	if(!window.localStorage) {
		log('localStorage is not supported in this browser.');
		return;
	}

	setUpGUI();

	if(unittest) {
		log("In unit testing mode.");
		var unittests = new UnitTestCollection;
	} else {
		log("Ding! Script started.");
		queueInterface = new QueueInterface;
	}
});
