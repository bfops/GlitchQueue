// ==UserScript==
// @name           Glitch Skill Helper
// @namespace      http://alpha.glitch.com/profiles/PIF6RN35T3D1DT2/
// @version        0.1.7
// @include        http://alpha.glitch.com
// @include        http://beta.glitch.com
// @include        http://alpha.glitch.com/
// @include        http://beta.glitch.com/
// @include        http://alpha.glitch.com/#
// @include        http://beta.glitch.com/#
// @description	   Helps you queue skills for learning in Glitch. $LastChangedDate: 2011-04-19 11:15:59 +0800 (Tue, 19 Apr 2011) $ $Rev: 142 $
// ==/UserScript==

// Ping's Skill Queuer for Glitch, modified by RobotGymnast to allow queuing of all skills.

/* Changelog:
0.1.0 (2010.12.18)
	- Ready for limited pre-alpha release.
0.1.3 (2010.12.22)
	- Fix excessive polling when skill is being learnt
0.1.6 (2011.01.15)
	- Fix bug with invalid skill in queue
0.1.7 (2011.04.19)
	- Helloooo beta!
*/
(function() {

// -------- start --------
/*
	CONFIGURABLE OPTIONS
*/
// All intervals/ages in seconds
var POLL_INTERVAL_DEFAULT = 1;
var POLL_INTERVAL_DISABLED = 15*60; // poll interval when game is disabled
var POLL_INTERVAL_ERROR = 60;	// poll interval when unknown error is encountered, maybe 500 errs

// **************************************************************************
// ------------------------ DO NOT EDIT FROM HERE ON ------------------------

/**
 * Version information
 */
var VERSION = "0.1.7"
function about() { alert ("Version: " + VERSION 
	+ "\n" + " $Rev: 142 $ "
	+ "\n" + " $Date: 2011-04-19 11:15:59 +0800 (Tue, 19 Apr 2011) $ "); }
if (!(typeof GM_registerMenuCommand === 'undefined')) { 
	GM_registerMenuCommand("Glitch Skill Helper - About", about); 
}

/**
 * unsafeWindow variables / functions
 */
if (!(typeof unsafeWindow === 'undefined')) { 
	$ = unsafeWindow.$;
	api_call = unsafeWindow.api_call;
	queue = unsafeWindow.queue;
	time = unsafeWindow.time;
	format_sec = unsafeWindow.format_sec;
	setInterval = unsafeWindow.setInterval;
	clearInterval = unsafeWindow.clearInterval;	
	window = unsafeWindow;
} 

/**
 * Timer jobs
 */
var uiQTimer = 0;
var pollQTimer = 0;

/**
 * Logger function
 */
function log(msg) {
	// return;
	var now = new Date();
	if (!$.isPlainObject(msg)) {
		msg = now.getHours() + ":" + now.getMinutes() + "." + now.getSeconds() + (now.getHours() > 11 ? "PM" : "AM") + " - " + msg;
	}
	if (window.console) { window.console.log(msg); }
	if (!(typeof GM_log === 'undefined')) { GM_log(msg); }
}

log("Ding! Script started.");

// ===========================================================================
/**	
 *	Queue class encapsulates queue handling logic
 */
function GlitchQueue(playerTSID, localDb) {
	this.Q_VALUE_KEY = "glitch_SkillQueue_" + playerTSID;	// storage key name
	this.skillLearning = {};
	this.availableSkills = {};
	this.allSkills = {};
	this.playerTSID = playerTSID;
	this.db = localDb;
	
	// explode queue array from storage
	this.getSavedQueue = function() {
		if (window.localStorage.getItem(this.Q_VALUE_KEY)) {
			return window.localStorage.getItem(this.Q_VALUE_KEY).split(",");
		}
		return [];
	};
	
	// get/set queue array from/to body
	this.getQueue = function () { return $('body').data("glitchq"); };
	this.setQueue = function(q) { $('body').data("glitchq", q); };

	// persist queue array to storage
	this.saveQueue = function(skillQueue, handler) {
		window.localStorage.removeItem(this.Q_VALUE_KEY);
		window.localStorage.setItem(this.Q_VALUE_KEY, skillQueue.toString());
			this.setQueue(skillQueue);
			if (handler) {
				handler();
			}
	};
	
	// add skill to queue
	this.addSkillToQueue = function(skillId, handler) {
		var q = this.getQueue();
		if (q.indexOf(skillId) < 0) {
			q.push(skillId);
			this.saveQueue(q, handler);
		}
	};
	
	// removes skill from queue
	this.removeSkillFromQueue = function (skillId, handler) {
		var q = this.getQueue();
		var idx = q.indexOf(skillId);
		if (idx > -1) { 
			q.splice(idx, 1); 
		}
		this.saveQueue(q, handler);
	};

	// purge all queued skill
	this.clearQueue = function() {		
		if (window.localStorage.getItem(this.Q_VALUE_KEY)) {
			window.localStorage.removeItem(this.Q_VALUE_KEY);
		}
		this.setQueue([]);
	};
}	// end: GlitchQueue() 
// ===========================================================================

// Skill Queue styling
if (!(typeof GM_addStyle === 'undefined')) {
	GM_addStyle('#skillQueue { border-top: 1px solid #C8E1DE; margin-top:10px; margin-bottom: 40px; }');
	GM_addStyle('.skillQueueItem { margin-top:10px; }');
	GM_addStyle('.skillError { border-left: 3px solid #DD8888; color: #DD8888; font-size: 11px; font-style: italic; margin-left: 2px; margin-bottom: 2px; padding: 0 3px 0 3px; display: none; }');
}

// Set tool tip for skill currently being learnt
function setTooltipForCurrentLearning() {
	if (typeof queue === 'undefined') { return; }
	var remaining = queue.end - time() - queue.skew;
	var completeDate = new Date((time() + remaining)*1000);

	$('.progress').attr('title', 'Finishing at ' 
		+ completeDate.getHours() + ':' + completeDate.getMinutes() + (completeDate.getHours() < 12 ? 'am' : 'pm')
		+ ' on ' + completeDate.getFullYear() + '.' + completeDate.getMonth() + '.' + completeDate.getDate());
}

var gQ;	// global queue object
var playerTSID;	// player Tiny Speck ID

// ----------------------------------------------------------------------------------------
$(document).ready(function() {
	
	if (!window.localStorage) {
		log('localStorage is not supported in this browser.');
		return;
	}
		
	var playerTSID = $('#nav-profile > a').attr('href').split("/")[2];
	if (!playerTSID) { return; }
	
	gQ = new GlitchQueue(playerTSID);
	$('body').data("glitchq", gQ.getSavedQueue());
	
	setTooltipForCurrentLearning();

	// Sidebar
	$('.col-side').prepend('<ul id="skillQueue"></ul>');
	$('.col-side').prepend('<h3>Skills Queue</h3>');
	$('.col-side').prepend('<a id="skillQAddLink" href="javascript: void(0);" style="font-size: 11px; font-weight: bold; float: right;">+Add</a>');

	$("#skillQAddLink").hide();	// hide link until ready to add

	doAvailableSkillsCache( function(e) {
		if (!e.ok) { log("Oops, something went wrong getting available skills: " + e.error); return; }
		if (e.skills) {
			gQ.availableSkills = e.skills;
			availableSkills_lastCache = time();
			var skillQueueSelect = $('<select style="margin-right: 10px; margin: left: 10px;" id="skillQueueSelect"><option value="">Choose!</option></select>');
			for (skillId in gQ.allSkills) {
				skill = gQ.allSkills[skillId];
				skillQueueSelect.append($('<option style="border-top: dotted 1px #ccc;" value="' + skillId + '">' + skill.name + '</option>'));
			}
			var skillQueueDialogueCont = $('<div class="dialog" id="skillQueueDialogueCont"></div>');
			var skillQueueDialogue = $('<div class="dialog-inner" id="skillQueueDialogue">'
				+ '<a class="close" href="javascript: void(0);" id="skillQueueDialogueclose">Close</a>'
				+ '<h2>Send a skill to Mr. Q!</h2>'
				+ 'Available Skills: '
				+ '</div>');
			var skillQueueAddBtn = $('<a id="skillQueueAddBtn" href="javascript: void(0);" class="button-tiny button-minor">Add!</a>');
			skillQueueDialogue.append(skillQueueSelect);
			skillQueueDialogue.append(skillQueueAddBtn);
			skillQueueDialogueCont.append(skillQueueDialogue);
			$("body").append(skillQueueDialogueCont);
			
			skillQueueDialogueCont.hide();
			// bind events
			skillQueueAddBtn.click(skillQueueAddBtn_onClick);
			$("#skillQAddLink").click(showAddQDialogue);
			$("#skillQueueDialogueclose").click(hideAddQDialogue);
			
			$("#skillQAddLink").show();
		}
		displayQueuedItems();
	});
	
	// Delay first poll by 2 secs to avoid refreshing cache twice
	if (pollQTimer) { window.clearTimeout(pollQTimer); }
	pollQTimer = window.setTimeout(pollJob, 2*1000);

});	// end: $(document).ready
// ----------------------------------------------------------------------------------------

/**
 * Updates UI progress bar for the skill being learnt
 */
function updateSkillQueueProgress(skillId) {
	if (gQ.skillLearning[skillId]) {
		var skill = gQ.skillLearning[skillId];
		var remaining = skill.time_complete - time() - skill.skew;
		var percentCompleted = (100 - (remaining / skill.total_time * 100));
		$('#' + skillId + '_skill_indicator').show();
		if (remaining > 0){
			if (remaining <= 5){
				$('#' + skillId + '_skill_remaining').html('OMG OMG OMG OMG ' + format_sec(remaining) + '');
			}
			else if (remaining <= 10){
				$('#' + skillId + '_skill_remaining').html('Almost there! ' + format_sec(remaining) + '');
			}
			else if (remaining <= 15){
				$('#' + skillId + '_skill_remaining').html('You can do it! ' + format_sec(remaining) + '');
			}
			else if (remaining <= 20){
				$('#' + skillId + '_skill_remaining').html('Oh, so close... ' + format_sec(remaining) + '');
			}
			else { 	
				$('#' + skillId + '_skill_remaining').html(format_sec(remaining) + ''); 
			}
			$('#' + skillId + '_skill_indicator').width((100 - (remaining / skill.total_time * 100)) + '%');
			if (uiQTimer) { window.clearTimeout(uiQTimer); }
			uiQTimer = window.setTimeout( function() { updateSkillQueueProgress(skillId) }, 1000);	// update every 1 second
		} else {
			$('#' + skillId + '_skill_remaining').html('Done!'); 
			window.clearTimeout(uiQTimer);	// clear the update
			uiQTimer = 0;
			$('#' + skillId + '_skill_indicator').width($('#' + skillId + '_skill_progress').innerWidth());
		}
	} else {
		log("No such skill (" + skill + ") in queue.");
	}
}

/**
 * Displays skills in queue in sidebar
 */
function displayQueuedItems() {
	var q = gQ.getQueue().slice(0);
	$.each(q, function(index, value) {
		showSkillInQueue(value);
	});	
}

/**
 * Displays Add Skill dialogue UI - used by +Add link
 */
function showAddQDialogue() {
	var skillQueueSelect = $('#skillQueueSelect');
	skillQueueSelect.html("<option value=''>Choose!</option>");
	for (skillId in gQ.allSkills) {
		skill = gQ.allSkills[skillId];
		skillQueueSelect.append($('<option style="border-top: dotted 1px #ccc;" value="' + skillId + '">' + skill.name + '</option>'));
	}
	$("#skillQueueDialogueCont").show();
}

/**
 * Hides Add Skill dialogue UI - used by dialogue's close button
 */
function hideAddQDialogue() {
	$("#skillQueueDialogueCont").hide();
}

/**
 * Click event handler for the Add button in the Add Skill dialogue
 */
function skillQueueAddBtn_onClick() {	
	var skillId = $("#skillQueueSelect").val();
	if (skillId) {
		gQ.addSkillToQueue(skillId, function() { showSkillInQueue(skillId); } );
	}
}

/**
 * Click event handler for the Remove [X] skill link
 */
function skillQRemoveLink_onClick(skillId) {
	gQ.removeSkillFromQueue(skillId, function() {
		$('#' + skillId + '_skillqueue_item').fadeOut('fast', function() {
			$('#' + skillId + '_skillqueue_item').remove();
		});
		var q = gQ.getQueue();
		if (q.length == 0) { pollJob(); }
	});	
}

/**
 * Displays individual skill details in the sidebar queue
 */
function showSkillInQueue(skillId) {
	var skill, remaining;
	if(gQ.availableSkills[skillId])
	{
		skill = gQ.availableSkills[skillId];
		remaining = skill.time_remaining;
	}
	else
	{
		skill = gQ.allSkills[skillId];
		remaining = skill.total_time;
	}
	var percentCompleted = (100 - (remaining / skill.total_time * 100));
	
	var skillQItem = $('<li class="skillQueueItem" id="' + skillId + '_skillqueue_item">'
		+ '<div style="display: block; font-weight: bold; padding-bottom: 3px;" class="minor">'
		+ 'Skill: <a style="font-weight: bold;" target="top" href="http://alpha.glitch.com/profiles/me/skills/">' + skill.name + '</a>'
		+ '</div>'
		+ '<div id="' + skillId + '_skill_error" class="skillError"></div>'
		+ '<a id="' + skillId + '_skillRemoveLink" title="Remove this skill from the Queue" style="color: #dd6666; font-size: 11px; float: right; display: block; padding-top: 4px;" '
		+ 'href="javascript: void(0);">X</a>'
		+ '<div id="' + skillId + '_skill_progress" class="progress" style="width: 200px; height: 22px; border-width: 2px; border-color: #a7b6bb;">'
		+ '<div id="' + skillId + '_skill_remaining" style="font-size: 11px; position: absolute; left: 0pt; top: 3px; text-align: center; width: 200px;">' + format_sec(remaining) + '</div>'
		+ '<div class="left"></div>'
		+ '<div id="' + skillId + '_skill_indicator" class="indicator" style="height: 22px; width: ' + percentCompleted + '%; display: ' + (percentCompleted > 0 ? "block" : "none") + ';">'
		+ '<img width="2" alt="" src="http://c1.glitch.bz/img/throbber-ext_28144.gif">'
		+ '</div>'
		+ '</div>'
		+ '</li>').hide();
	$('#skillQueue').append(skillQItem);
	$('#'+ skillId + '_skillRemoveLink').click(function() { skillQRemoveLink_onClick(skillId); });
	skillQItem.fadeIn('slow');
}

/**
 * Submit skill for learning
 */
function submitSkill(skillId, handler) {
	api_call("skills.learn", { 'skill_id' : skillId }, function(e) {
		if (e.ok) {
			var skill = gQ.availableSkills[skillId];
			skill.time_complete = skill.time_remaining + time();
			skill.skew = 0;
			gQ.skillLearning[skillId] = skill;
			if (uiQTimer) { window.clearTimeout(uiQTimer); }
			uiQTimer = window.setTimeout(function () { updateSkillQueueProgress(skillId); }, 1000);
		}
		if (handler) { handler(e); }
	});
}

/**
 * Refreshes Available Skills cache
 */
var availableSkills_lastCache = 0;
function doAvailableSkillsCache(handler) {
	//log("Cache Last: " + new Date(availableSkills_lastCache*1000));
	//log("Cache is too old.");
	api_call("skills.listAvailable", { per_page: 1024 }, function (e) { 
		if (!e.ok) { return; }	// quit if unable to get available skills
		if (e.skills) {
			gQ.availableSkills = e.skills;
			availableSkills_lastCache = time();
		}
		if (handler) { handler(e); }
	});
	api_call("skills.listAll", { per_page: 1024 }, function (e) { 
		if (!e.ok) { return; }	// quit if unable to get all skills
		if (e.items) {
			gQ.allSkills = e.items;
		}
	});
}

/**
 * Massively too convulated polling job
*/
var currentSkillExpires = 0;	// Completetion datetime (secs since epoch) of the current learning skill
function pollJob() {
	log("pollJob started.");
	
	var q = gQ.getQueue();
	
	if (currentSkillExpires > time() || q.length == 0) { 
		if (pollQTimer) { window.clearTimeout(pollQTimer); }
		pollQTimer = window.setTimeout(pollJob, POLL_INTERVAL_DEFAULT*1000); 
		return; 
	}	// last skill learnt has not finished
	
	api_call("skills.listLearning", {}, function(e) {
		if (!e.ok) { log("Oops, poll broke while trying to check learning. " + e.error); return; }
		if (e.learning) {
			for (skillId in e.learning) {
				var skill = e.learning[skillId];
				skill.skew = skill.time_complete - skill.time_remaining - time();	// to fix user's system clock skew off server time
				var remaining = skill.time_complete - time() - skill.skew;
				currentSkillExpires = skill.time_complete - skill.skew;
				if (pollQTimer) { window.clearTimeout(pollQTimer); }
				pollQTimer = window.setTimeout(pollJob, remaining*1000);
				break;
			}
		}

		if (currentSkillExpires <= time()) {	//  nothing is being learnt and skills are queued
			doAvailableSkillsCache();
			if(q.length == 0)
				return;

			// move all unlearnable skills to the end of the queue
			var unlearnableCount = 0;
			for(; unlearnableCount < q.length && !gQ.availableSkills[q[0]]; ++unlearnableCount) {
				var skillId = q[0];
				// move the skill to the end of the queue.
				gQ.removeSkillFromQueue(skillId);
				gQ.addSkillToQueue(skillId);
			}
			// iff unlearnableCount == q.length, there are no learnable skills in the queue
			if(unlearnableCount < q.length) {
				var skillId = q[0];
				submitSkill(skillId, function(e) {	// handle submit skill sucess/failure
					if (e.ok) {	// submitted successfully
						gQ.removeSkillFromQueue(skillId);
						$('#' + skillId + '_skill_error').html('');
						$('#' + skillId + '_skill_error').hide();
						$('#' + skillId + '_skillRemoveLink').hide();
						currentSkillExpires = gQ.availableSkills[skillId].time_remaining + time();
						log("Poll job scheduled for " + (gQ.availableSkills[skillId].time_remaining + 3) + " secs later.");
						if (pollQTimer) { window.clearTimeout(pollQTimer); }
						pollQTimer = window.setTimeout(pollJob, (gQ.availableSkills[skillId].time_remaining + 5)*1000);	// Buffer 5 secs to next poll job
					} else {
						currentSkillExpires = 0;
						var skillError = $('#' + skillId + '_skill_error');
						if (e.error == "The game is disabled.") { // Argh game is disabled
							log("Game is disabled. Poll job scheduled for " + POLL_INTERVAL_DISABLED + " secs / " + (POLL_INTERVAL_DISABLED/60).toFixed(2) + " mins later.");
							skillError.html('Game is disabled.');
							if (pollQTimer) { window.clearTimeout(pollQTimer); }
							pollQTimer = window.setTimeout(pollJob, POLL_INTERVAL_DISABLED*1000);	// try again 15 mins later
						} 
						// [TODO] handle (1) skill already learnt, (2) some unknown error
						else if (e.error == "Skill is already learnt. [TODO]") {	// Glitch doesn't check this, allows skill to be submitted
							gQ.removeSkillFromQueue(skillId);
							// remove skill from queue
							skillError.html('You have already learnt this skill.');
						}
						else if (e.error == "Doesn't meet requirements") {
							// skip or remove from queue?
							// TODO: it's stuck
							skillError.html('You cannot learn this skill yet.');
							gQ.removeSkillFromQueue(skillId);
							// learn it later
							gQ.addSkillToQueue(skillId);
							if (pollQTimer) { window.clearTimeout(pollQTimer); }
							pollQTimer = window.setTimeout(pollJob, POLL_INTERVAL_DEFAULT*1000);	// try again later for unknown error
						} else {
							skillError.html('Error: ' + e.error);
							if (pollQTimer) { window.clearTimeout(pollQTimer); }
							pollQTimer = window.setTimeout(pollJob, POLL_INTERVAL_ERROR*1000);	// try again later for unknown error
						}
						skillError.fadeIn('slow');
					}
				});	// end: submitSkill(q[0], function(e) {
			}	
		} else {
			if (pollQTimer) { window.clearTimeout(pollQTimer); }
			if (q.length == 0) {
				log("Queue is empty.");
				pollQTimer = window.setTimeout(pollJob, POLL_INTERVAL_DEFAULT*1000); // check again in 1 sec
			} else {
				// Check later
				log("Rescheduling poll job for " + (currentSkillExpires - time()) + " secs later.");
				pollQTimer = window.setTimeout(pollJob, (currentSkillExpires - time()) * 1000); // check again when skill is completed
			}
		} // end: if (currentSkillExpires < time() && q.length > 0)
		
	});	// end: api_call("skills.listLearning", {}, function(e) {
	
} // end: pollJob()

// -------- end --------
})();

