// ==UserScript==
// @name                Glitch Skill Helper
// @include             http://beta.glitch.com
// @include             http://beta.glitch.com/
// @include             http://beta.glitch.com/#
// @description         Manages skill-queuing for learning in Glitch.
// ==/UserScript==

// Don't change this unless you know what a unit test is, and you want to enable them, instead of the regular script.
var unittest = true;
// Poll intervals for different occurances.
// No learnable skills.
var POLL_INTERVAL_UNLEARNABLE = 1 * 60; 
// Game disabled.
var POLL_INTERVAL_DISABLED = 5 * 60;
// Other error encountered.
var POLL_INTERVAL_ERROR = 1 * 60;

// Returns [a] \ [b] (i.e. all elements in [a] which are not in [b]).
function relativeComplement(a, b)
{
    var ret = {};

    for(x in a)
        if(typeof(b[x]) == "undefined")
            ret[x] = a[x];

    return ret;
}

// Returns true iff all of [a]'s members equal [b]'s corresponding members.
function objEquals(a, b)
{
    for(x in b)
        if(typeof(a[x]) == "undefined")
            return false;

    for(x in a)
    {
        if(typeof(b[x]) == "undefined")
            return false;

        if(a[x])
        {
            if(typeof(a[x]) == "object")
            {
                if(typeof(b[x]) != "object" || !objEquals(a[x], b[x]))
                    return false;
            }
            else if(a[x] !== b[x])
                return false;
        }
        else if(b[x])
            return false;
    }

    return true;
}

// Return a copy of [a]
function objClone(a)
{
    var ret = (a instanceof Array ? [] : {});

    for(x in a)
        if(typeof(a[x]) == "object")
            ret[x] = objClone(a[x]);
        else
            ret[x] = a[x];

    return ret;
}

if(GM_registerMenuCommand)
    GM_registerMenuCommand("About Glitch Skill Queuer", function()
    {
        alert("ping's skill queuer for Glitch, modified by RobotGymnast.");
    });

/**
 * unsafeWindow variables / functions
 */
if(unsafeWindow)
{
    $ = unsafeWindow.$;
    api_call = unsafeWindow.api_call;
    queue = unsafeWindow.queue;
    time = unsafeWindow.time;
    format_sec = unsafeWindow.format_sec;
    setInterval = unsafeWindow.setInterval;
    clearInterval = unsafeWindow.clearInterval;
    window = unsafeWindow;
}

// An API wrapper, which can override specific API calls with fake data.
function API()
{
    this.call = function(callName, args, handler)
    {
        if(apiReturns[callName])
        {
            log("API call " + callName + " overriden.");
            if(handler) handler(apiReturns[callName]);
            if(callbacks[callName]) callbacks[callName](args, apiReturns[callName]);
        }
        else
        {
            if(callbacks[callName])
                api_call(callName, args, function(e)
                {
                    handler(e);
                    callbacks[callName](args, e);
                });
            else
                api_call(callName, args, handler);
        }
    }

    // Override API call [apiCallName] to return [apiReturn].
    this.setAPIOverride = function(apiCallName, apiReturn)
    {
        apiReturns[apiCallName] = apiReturn;
    }

    this.clearAPIOverride = function(apiCallName)
    {
        this.setAPIOverride(apiCallName, undefined);
    }

    // Call [callback] after the normal handler for [apiCallName] has been executed.
    this.setAPICallback = function(apiCallName, callback)
    {
        callbacks[apiCallName] = callback;
    }

    this.clearAPICallback = function(apiCallName)
    {
        this.setAPICallback(apiCallName, undefined);
    }

    // Collection of API overrides.
    var apiReturns = {};
    // Collection of API callbacks.
    var callbacks = {};
}

// Temporary storage of items, with the same interface as window.localStorage.
function LocalStorage()
{
    this.getItem = function(key)
    {
        return storedItems[key];
    }

    this.setItem = function(key, value)
    {
        storedItems[key] = value;
    }

    this.removeItem = function(key)
    {
        this.setItem(key, undefined);
    }

    var storedItems = {};
}

// Wraps a storage system for a specific key name.
function StorageKey(storage, keyName)
{
    this.get = function()
    {
        return this.storage.getItem(this.keyName);
    }

    this.set = function(value)
    {
        this.storage.setItem(this.keyName, value);
    }

    this.remove = function()
    {
        this.storage.removeItem(this.keyName);
    }

    this.storage = storage;
    this.keyName = keyName;
}

// Wait to receive [numberOfSignals] signals before calling [callback].
function SignalCounter(numberOfSignals, callback)
{
    this.sendSignal = function()
    {
        if(--numberOfSignals <= 0)
            callback();
    }
}

// Run and log a collection of unit tests.
// [completionCallback] is the function to call when all tests are completed.
function UnitTestCollection(completionCallback)
{
    // A unit test is a function with a specific description.
    function UnitTest(func, name)
    {
        this.run = function()
        {
            func(name);
        }
    }

    function test_signalCounter(testName)
    {
        var count = 4;
        var exitedLoop = false;
        var testSignal = new SignalCounter(count, function()
        {
            logTestResult(testName, (exitedLoop ? count == 0 : count == 1));
        });

        for(; count > 0; --count)
            testSignal.sendSignal();
        exitedLoop = true;
    }

    function test_objClone(testName)
    {
        var obj1 = [1, 2, 3, 4, 5];
        var obj2 = { x : 5, y : "hello", z : { a : "sdf", b : 12 } };

        // Make sure copies are identical.
        var obj1c = objClone(obj1);
        var obj2c = objClone(obj2);

        if(!(objEquals(obj1, obj1c) && objEquals(obj2, obj2c)))
        {
            logTestResult(testName, false);
            return;
        }

        // Make sure no references were kept; change the originals, so they should no longer match the copies.
        obj1[0] = 6;
        obj2["z"]["b"] = 6;

        logTestResult(testName, !objEquals(obj1, obj1c) && !objEquals(obj2, obj2c));
    }

    function test_relativeComplement(testName)
    {
        var obj1 = { hello : "blah", goodbye : "goodbye", bonjour : "asdf", salut : "qwerty", salve : "vale" };
        var obj2 = { uno : "1", no : "0", re : "2", trois : "3", hello : "tyu", bonjour : "asdf", goodbye : "au revoir" };

        logTestResult(testName, objEquals(relativeComplement(obj2, obj1), { uno : "1", no : "0", re : "2", trois : "3" }));
    }

    function test_localStorage(testName)
    {
        var storage = new LocalStorage;
        storage.setItem("brush", 5);
        storage.setItem("hellSpawn__!!", "RobotGymnast");
        storage.setItem("Pokemon", "Digimon?");
        var storageKey = new StorageKey(storage, "brush");
        var removeable = new StorageKey(storage, "Pokemon");
        removeable.remove();

        logTestResult(testName, storageKey.get() == 5 && storage.getItem("hellSpawn__!!") == "RobotGymnast" && storage.getItem("Pokemon") == undefined);
    }

    function test_objEquals(testName)
    {
        var obj1 = { x : 5, y : "hall", z : { a : 'j', b : 6.2 } };
        var obj2 = { x : 5, y : "hall", z : { a : 'j', b : 6.2 } };
        var obj3 = { x : "5", y : "hall", z : { a : 'j', b : 6.2 } };
        var obj4 = { x : 5, y : "hall", z : {} };
        var obj5 = { x : 5, y : "hall", z : { a : 'j', b : 6.2, c : "~" } };
        var obj6 = { x : 5, y : "hall", z : { a : 'j' } };

        logTestResult(testName, objEquals(obj1, obj2) && !objEquals(obj1, obj3) && !objEquals(obj1, obj4) && !objEquals(obj1, obj5) && !objEquals(obj1, obj6));
    }

    function test_apiOverriding(testName)
    {
        var testAPI = new API;
        var desired = { "purpleDragon" : { "ofcourse" : 1, "whynot?" : { "excellent" : 12, "12" : "hello" } } };
        var numberReturned = 0;
        var totalNumber = 0;

        for(callName in desired)
        {
            testAPI.setAPIOverride(callName, desired[callName]);
            testAPI.call(callName, {}, function(ret)
            {
                if(ret != desired[callName])
                    logTestResult(testName, false);
            }.bind(this));
        }

        logTestResult(testName, true);
    }

    function test_apiCallbacks(testName)
    {
        var testAPI = new API;
        var correctCallbackCalledFirst = false;

        testAPI.setAPIOverride("test", {});
        testAPI.setAPICallback("test", function(args, e)
        {
            logTestResult(testName, correctCallbackCalledFirst);
        });

        testAPI.call("test", {}, function (e)
        {
            correctCallbackCalledFirst = true;
        });
    }

    function test_addToQueue(testName)
    {
        var magicSkill = { name : "Magic", total_time : 10, time_remaining : 10 };
        var magic2Skill = objClone(magicSkill);
        magic2Skill.name = "Magic2";

        var api = new API;
        api.setAPIOverride("skills.listAll", { ok : 1, items : { magic : magicSkill, magic2 : magic2Skill } });
        api.setAPIOverride("skills.listAvailable", { ok : 1, skills : { magic : magicSkill, magic2 : magic2Skill } });
        api.setAPIOverride("skills.listLearned", { ok : 1, skills : {} });
        api.setAPIOverride("skills.listLearning", { ok : 1, learning : {} });
        api.setAPIOverride("skills.learn", { ok : 1 });

        var testQueue = new QueueInterface(api, new StorageKey(new LocalStorage, "x"));

        testQueue.skillQueue.doUnlearnedSkillsCache(testQueue.api, function(e)
        {
            testQueue.skillQueue.addSkillToQueue("magic", function(q1)
            {
                if(!objEquals(q1, ["magic"]))
                {
                    logTestResult(testName, false);
                    return;
                }

                testQueue.skillQueue.addSkillToQueue("magic2", function(q2)
                {
                    logTestResult(testName, objEquals(q2, ["magic", "magic2"]));
                });
            });
        });
    }

    function test_removeFromQueue(testName)
    {
        var magicSkill = { name : "Magic", total_time : 10, time_remaining : 10 };

        var api = new API;
        api.setAPIOverride("skills.listAll", { ok : 1, items : { magic : magicSkill } });
        api.setAPIOverride("skills.listAvailable", { ok : 1, skills : { magic : magicSkill } });
        api.setAPIOverride("skills.listLearned", { ok : 1, skills : {} });
        api.setAPIOverride("skills.listLearning", { ok : 1, learning : {} });
        api.setAPIOverride("skills.learn", { ok : 1 });

        var testQueue = new QueueInterface(api, new StorageKey(new LocalStorage, "x"));

        testQueue.skillQueue.doUnlearnedSkillsCache(testQueue.api, function(e)
        {
            testQueue.skillQueue.addSkillToQueue("magic", function(q1)
            {
                if(!objEquals(q1, ["magic"]))
                {
                    logTestResult(testName, false);
                    return;
                }

                testQueue.skillQueue.removeSkillFromQueue("magic", function(q2)
                {
                    logTestResult(testName, objEquals(q2, []));
                    if(testQueue.uiQTimer) window.clearTimeout(testQueue.uiQTimer);
                    if(testQueue.pollQTimer) window.clearTimeout(testQueue.pollQTimer);
                });
            });
        });
    }

    function test_noSkillLoadQueueFrontLearnable(testName)
    {
        var magicSkill = { name : "Magic", total_time : 10, time_remaining : 10 };
        var magic2Skill = objClone(magicSkill);
        magic2Skill.name = "Magic 2";

        var api = new API;
        api.setAPIOverride("skills.listAll", { ok : 1, items : { magic : magicSkill, magic2 : magic2Skill } });
        api.setAPIOverride("skills.listAvailable", { ok : 1, skills : { magic : magicSkill, magic2 : magic2Skill } });
        api.setAPIOverride("skills.listLearned", { ok : 1, skills : {} });
        api.setAPIOverride("skills.listLearning", { ok : 1, learning : {} });
        api.setAPIOverride("skills.learn", { ok : 1 });

        var storage = new StorageKey(new LocalStorage, "x");
        storage.set(["magic", "magic2"].toString());

        var testQueue;
        var selectedArgs;

        var logResult = new SignalCounter(2, function()
        {
            logTestResult(testName, selectedArgs.skill_id == "magic", testQueue.skillQueue.getQueue() == ["magic2"]);

            if(testQueue.uiQTimer) window.clearTimeout(testQueue.uiQTimer);
            if(testQueue.pollQTimer) window.clearTimeout(testQueue.pollQTimer);
        });

        api.setAPICallback("skills.learn", function(args, e)
        {
            selectedArgs = args;
            logResult.sendSignal();
        });

        testQueue = new QueueInterface(api, storage);
        logResult.sendSignal();
    }

    function test_noSkillLoadQueueMiddleLearnable(testName)
    {
        var magicSkill = { name : "Magic", total_time : 10, time_remaining : 10 };
        var magic2Skill = objClone(magicSkill);
        magic2Skill.name = "Magic 2";

        var api = new API;
        api.setAPIOverride("skills.listAll", { ok : 1, items : { magic : magicSkill, magic2 : magic2Skill } });
        api.setAPIOverride("skills.listAvailable", { ok : 1, skills : { magic : magicSkill } });
        api.setAPIOverride("skills.listLearned", { ok : 1, skills : {} });
        api.setAPIOverride("skills.listLearning", { ok : 1, learning : {} });
        api.setAPIOverride("skills.learn", { ok : 1 });

        var storage = new StorageKey(new LocalStorage, "x");
        storage.set(["magic2", "magic"].toString());

        var testQueue;
        var selectedArgs;

        var logResult = new SignalCounter(2, function()
        {
            logTestResult(testName, selectedArgs.skill_id == "magic", testQueue.skillQueue.getQueue() == ["magic2"]);

            if(testQueue.uiQTimer) window.clearTimeout(testQueue.uiQTimer);
            if(testQueue.pollQTimer) window.clearTimeout(testQueue.pollQTimer);
        });

        api.setAPICallback("skills.learn", function(args, e)
        {
            selectedArgs = args;
            logResult.sendSignal();
        });

        testQueue = new QueueInterface(api, storage);
        logResult.sendSignal();
    }

    var testResults = [];
    var numberSucceeded = 0;

    function logTestResult(testName, result)
    {
        testResults.push({ name : testName, "result" : result });
        if(result == true)
            ++numberSucceeded;

        if(testResults.length == unittests.length)
        {
            $.each(testResults, function(i, test)
            {
                log("Test " + (test["result"] ? "succeeded" : "failed") + ": " + test["name"]);
            });
            log(numberSucceeded + "/" + testResults.length + " tests succeeded.");

            if(completionCallback)
                completionCallback(numberSucceeded == testResults.length);
        }
    }

    var unittests = [
        new UnitTest(test_signalCounter, "Signal-counter class"),
        new UnitTest(test_objClone, "Object clone function"),
        new UnitTest(test_relativeComplement, "Relative complement function"),
        new UnitTest(test_localStorage, "Local storage"),
        new UnitTest(test_objEquals, "Object equality"),
        new UnitTest(test_apiOverriding, "API wrapper return-hooking"),
        new UnitTest(test_apiCallbacks, "API wrapper callback calls"),
        new UnitTest(test_addToQueue, "Adding to queue"),
        new UnitTest(test_removeFromQueue, "Removing from queue"),
        new UnitTest(test_noSkillLoadQueueFrontLearnable, "Page load with queue including learnable skill"),
        new UnitTest(test_noSkillLoadQueueMiddleLearnable, "Page load with queue including learnable skill 2")/*,
        new UnitTest(test_noSkillLoadQueueNoLearnable, "Page load with queue including no learnable skills")*/
    ];

    $.each(unittests, function(i, test)
    {
        test.run();
    });
}

// Skill Queue styling
if(GM_addStyle)
{
    GM_addStyle('#skillQueue { border-top: 1px solid #C8E1DE; margin-top:10px; margin-bottom: 40px; }');
    GM_addStyle('.skillQueueItem { margin-top:10px; }');
    GM_addStyle('.skillError { border-left: 3px solid #DD8888; color: #DD8888; font-size: 11px; font-style: italic; margin-left: 2px; margin-bottom: 2px; padding: 0 3px 0 3px; display: none; }');
}

function setUpGUI(queueInterface)
{
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
    // Bind button events
    skillQueueAddBtn.click(function() { queueInterface.skillQueueAddBtn_onClick(); });
    $("#skillQueueDialogueclose").click(function() { queueInterface.hideAddQDialogue(); });

    // Sidebar
    $('.col-side').prepend('<ul id="skillQueue"></ul>');
    $('.col-side').prepend('<h3>Skills Queue</h3>');
    $('.col-side').prepend('<a id="skillQAddLink" href="javascript: void(0);" style="font-size: 11px; font-weight: bold; float: right;">+Add</a>');

    $("#skillQAddLink").click(function() { queueInterface.showAddQDialogue(); });
}

function log(msg)
{
    if(window.console) window.console.log(msg);
    if(GM_log) GM_log(msg);
}

/**
 *    Queue class encapsulates queue handling logic
 */
function GlitchQueue(queueStorageKey)
{
    // Get queue from local storage.
    this.getSavedQueue = function()
    {
        if(this.queueStorageKey.get())
            return this.queueStorageKey.get().split(",");
        return [];
    };

    // Queue-HTML interface.
    this.getQueue = function() { return $('body').data("glitchq"); };
    this.setQueue = function(q) { $('body').data("glitchq", q); };

    // Send queue to local storage.
    this.saveQueue = function(skillQueue, handler)
    {
        this.queueStorageKey.remove();
        this.queueStorageKey.set(skillQueue.toString());
        this.setQueue(skillQueue);
        if(handler)
            handler(skillQueue);
    };

    this.addSkillToQueue = function(skillId, handler)
    {
        log("Adding " + this.unlearnedSkills[skillId].name + " to queue.");
        var q = this.getQueue();
        q.push(skillId);
        this.saveQueue(q, handler);
    };

    this.removeSkillFromQueue = function(skillId, handler)
    {
        log("Removing " + this.unlearnedSkills[skillId].name + " from queue.");
        var q = this.getQueue();
        q.splice(q.indexOf(skillId), 1);
        this.saveQueue(q, handler);
    };

    // Re-cache available skills, and (if necessary) pass the cache to [handler].
    this.doAvailableSkillsCache = function(api, handler)
    {
        log("Renewing available skills cache.");
        api.call("skills.listAvailable", { per_page: 1024 }, function(e)
        {
            if(e.ok && e.skills)
            {
                this.availableSkills = e.skills;
                if(handler) handler(e.skills);
            }
        }.bind(this));
    }

    // Re-cache unlearnable skills, and (if necessary) pass the cache to [handler].
    this.doUnlearnedSkillsCache = function(api, handler)
    {
        log("Renewing unlearned skills cache.");
        api.call("skills.listAll", { per_page: 1024 }, function(all)
        {
            if(all.ok && all.items)
                api.call("skills.listLearned", {}, function(learned)
                {
                    if(learned.ok && learned.skills)
                    {
                        this.unlearnedSkills = relativeComplement(all.items, learned.skills);
                        if(handler) handler(this.unlearnedSkills);
                    }
                }.bind(this));
        }.bind(this));
    }

    this.queueStorageKey = queueStorageKey;
    this.availableSkills = {};
    this.unlearnedSkills = {};
    this.skillLearning = {};
}

// Handles the queue's interactions with the user, the webpage, and the API.
function QueueInterface(api, storageKey)
{
    // [time] is in seconds.
    this.renewPollTimer = function(time)
    {
        if(this.pollQTimer != 0) window.clearTimeout(this.pollQTimer);
        this.pollQTimer = window.setTimeout(function() { this.pollJob(); }.bind(this), time * 1000);
    }

    // Set tool tip for skill currently being learnt
    this.setTooltipForCurrentLearning = function()
    {
        var completeDate = new Date(currentSkillExpires * 1000);

        $('.progress').attr('title', 'Finishing at '
            + completeDate.getHours() + ':' + completeDate.getMinutes() + (completeDate.getHours() < 12 ? 'am' : 'pm')
            + ' on ' + completeDate.getFullYear() + '.' + completeDate.getMonth() + '.' + completeDate.getDate());
    }

    /**
     * Updates UI progress bar for the skill being learnt
     */
    this.updateSkillQueueProgress = function(skillId)
    {
        var skill = this.skillQueue.skillLearning;
        var remaining = currentSkillExpires - time();
        var percentCompleted = (100 - (remaining / skill.total_time * 100));
        $('#' + skillId + '_skill_indicator').show();

        if(remaining > 0)
        {
            var prefix = "";
            if(remaining <= 5) prefix = 'OMG OMG OMG OMG ';
            else if(remaining <= 10) prefix = 'Almost there! ';
            else if(remaining <= 15) prefix = 'You can do it! ';
            else if(remaining <= 20) prefix = 'Oh, so close... ';

            $('#' + skillId + '_skill_remaining').html(prefix + format_sec(remaining));
            $('#' + skillId + '_skill_indicator').width((100 - (remaining / skill.total_time * 100)) + '%');

            // Schedule UI update.
            if(uiQTimer) window.clearTimeout(uiQTimer);
            uiQTimer = window.setTimeout(function() { this.updateSkillQueueProgress(skillId) }.bind(this), 1000);
        }
        else
        {
            $('#' + skillId + '_skill_remaining').html('Done!');
            window.clearTimeout(uiQTimer);
            uiQTimer = 0;
            $('#' + skillId + '_skill_indicator').width($('#' + skillId + '_skill_progress').innerWidth());
        }
    }

    /**
     * Displays skills in queue in sidebar
     */
    this.displayQueuedItems = function()
    {
        var q = this.skillQueue.getQueue();
        var newQ = [];
        $.each(q, function(index, skillId)
        {
            if(this.skillQueue.unlearnedSkills[skillId])
            {
                this.showSkillInQueue(skillId);
                newQ.push(skillId);
            }
        }.bind(this));

        this.skillQueue.saveQueue(newQ);
    }

    /**
     * Displays Add Skill dialogue UI - used by +Add link
     */
    this.showAddQDialogue = function()
    {
        var skillQueueSelect = $('#skillQueueSelect');
        skillQueueSelect.html("<option value=''>Choose!</option>");
        for(skillId in this.skillQueue.unlearnedSkills)
        {
            var skill = this.skillQueue.unlearnedSkills[skillId];
            skillQueueSelect.append($('<option style="border-top: dotted 1px #ccc;" value="' + skillId + '">' + skill.name + '</option>'));
        }
        $("#skillQueueDialogueCont").show();
    }

    /**
     * Hides Add Skill dialogue UI - used by dialogue's close button
     */
    this.hideAddQDialogue = function()
    {
        $("#skillQueueDialogueCont").hide();
    }

    /**
     * Click event handler for the Add button in the Add Skill dialogue
     */
    this.skillQueueAddBtn_onClick = function()
    {
        var skillId = $("#skillQueueSelect").val();
        if(skillId)
        {
            this.skillQueue.addSkillToQueue(skillId, function() { this.showSkillInQueue(skillId); }.bind(this));

            if(this.pollQTimer == 0)
                this.renewPollTimer(1);
        }
    }

    /**
     * Click event handler for the Remove [X] skill link
     */
    this.skillQRemoveLink_onClick = function(skillId)
    {
        this.skillQueue.removeSkillFromQueue(skillId, function()
        {
            $('#' + skillId + '_skillqueue_item').fadeOut('fast', function()
            {
                $('#' + skillId + '_skillqueue_item').remove();
            });
            var q = this.skillQueue.getQueue();
            if(q.length == 0) this.pollJob();
        }.bind(this));
    }

    /**
     * Displays individual skill details in the sidebar queue
     */
    this.showSkillInQueue = function(skillId)
    {
        var skill, remaining;
        if(this.skillQueue.availableSkills[skillId])
        {
            skill = this.skillQueue.availableSkills[skillId];
            remaining = skill.time_remaining;
        }
        else
        {
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
        $('#'+ skillId + '_skillRemoveLink').click(function() { this.skillQRemoveLink_onClick(skillId); }.bind(this));
        skillQItem.fadeIn('slow');
    }

    this.trySkillSubmit = function(skillId)
    {
        this.api.call("skills.learn", { skill_id : skillId }, function(e)
        {
            log("Skill learn " + skillId + " submitted with result " + e.ok);

            if(e.ok)
            {
                this.skillQueue.skillLearning = this.skillQueue.availableSkills[skillId];

                if(this.uiQTimer) window.clearTimeout(uiQTimer);
                this.uiQTimer = window.setTimeout(function() { this.updateSkillQueueProgress(skillId); }.bind(this), 1000);

                this.skillQueue.removeSkillFromQueue(skillId);
                $('#' + skillId + '_skill_error').html('');
                $('#' + skillId + '_skill_error').hide();
                $('#' + skillId + '_skillRemoveLink').hide();
                var skill = this.skillQueue.availableSkills[skillId];
                currentSkillExpires = skill.time_remaining + time();
                this.renewPollTimer(skill.time_remaining);
                log("Started learning " + skill.name + ".");
            } 
            else
            {
                currentSkillExpires = 0;
                var skillError = $('#' + skillId + '_skill_error');

                if(e.error == "The game is disabled.")
                {
                    log("Game is disabled. Checking again in " + POLL_INTERVAL_DISABLED + " seconds.");
                    this.renewPollTimer(POLL_INTERVAL_DISABLED);
                }
                else
                {
                    log("Error submitting skill: " + e.error + ". Checking again in " + POLL_INTERVAL_ERROR + " seconds.");
                    this.renewPollTimer(POLL_INTERVAL_ERROR);
                }

                skillError.html('Error: ' + e.error);
                skillError.fadeIn('slow');
            }
        }.bind(this));
    }

    // Completetion datetime of the current skill being learned.
    this.currentSkillExpires = 0;
    this.pollJob = function()
    {
        log("Checking skill status...");

        var q = this.skillQueue.getQueue();

        // Rotates the queue until a learnable skill is reached. Returns true iff there is a learnable skill in the queue.
        this.rotateQueueToLearnableSkill = function()
        {
            // Move all unlearnable skills to the end of the queue.
            var unlearnableCount = 0;
            for(; unlearnableCount < q.length && !this.skillQueue.availableSkills[q[0]]; ++unlearnableCount)
            {
                var skillId = q[0];
                // Move the skill to the end of the queue.
                this.skillQueue.removeSkillFromQueue(skillId);
                this.skillQueue.addSkillToQueue(skillId);
            }

            return (unlearnableCount < q.length);
        }

        this.api.call("skills.listLearning", {}, function(e)
        {
            if(!e.ok)
            {
                log("Error when checking for the current skill: " + e.error);
                return;
            }

            if(e.learning)
            {
                for(skillId in e.learning)
                {
                    // Another skill was selected outside of this script.
                    var skill = e.learning[skillId];
                    var remaining = skill.time_remaining;
                    log("Skill " + skill.name + " selected outside of this script. Checking back on completion."); 
                    currentSkillExpires = time() + remaining;
                    // Poll once the skill is done.
                    this.renewPollTimer(remaining);

                    return;
                }
            }

            log("No skills are being learned.");

            if(q.length == 0)
            {
                log("No skills in queue.");
                return;
            }

            // Refresh both caches.
            this.skillQueue.doUnlearnedSkillsCache(this.api);
            this.skillQueue.doAvailableSkillsCache(this.api, function(x)
            {
                if(this.rotateQueueToLearnableSkill())
                    this.trySkillSubmit(q[0]);
                else
                {
                    log("No learnable skills in queue.");
                    this.renewPollTimer(POLL_INTERVAL_UNLEARNABLE);
                }
            }.bind(this));

        }.bind(this));

    }

    this.api = api;
    this.storageKey = storageKey;

    this.uiQTimer = 0;
    this.pollQTimer = 0;

    this.skillQueue = new GlitchQueue(this.storageKey);
    $('body').data("glitchq", this.skillQueue.getSavedQueue());

    // Display the queue after creating both caches.
    this.skillQueue.doUnlearnedSkillsCache(this.api, function(x)
    {
        this.skillQueue.doAvailableSkillsCache(this.api, function(x) { this.displayQueuedItems(); }.bind(this));
    }.bind(this));

    this.pollJob();

}

$(document).ready(function()
{
    function runScript()
    {
        if(!window.localStorage)
        {
            log('localStorage is not supported in this browser.');
            return;
        }

        var playerTSID = $('#nav-profile > a').attr('href').split("/")[2];
        if(!playerTSID)
        {
            log("Could not get player's TSID.");
            return;
        }

        log("Script started.");
        var queueInterface = new QueueInterface(new API, new StorageKey(window.localStorage, "glitch_SkillQueue_" + playerTSID));
        setUpGUI(queueInterface);
    }

    if(unittest)
    {
        function testComplete(allSucceeded)
        {
            if(allSucceeded)
                runScript();
            else
            {
                var error = "Not all unit tests passed! Stopping script.";
                log(error);
                alert(error);
            }
        }

        log("In unit testing mode.");
        var unittests = new UnitTestCollection(testComplete);
    }
    else
        runScript();
});

