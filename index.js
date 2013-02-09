"use strict";

var Steam = require('steam'),
	irc = require('irc'),
	http = require('http'),
	url = require('url');

var debug = true;

var config = {

	// Steam config
	'steamName': '',
	'steamUsername': '',
	'steamPassword': '',
	'steamGroupId': '',

	// IRC config
	'ircHostname': '',
	'ircName': '',
	'ircUsername': '',
	'ircPassword': '',
	'ircChannels': [''],

}

// Map IRC auth
var ircAuth = {};
// Map IRC users to Steam
var ircToSteam = {};
// Map Steam users to IRC
var steamToIrc = {};
// Verification hash table
var ircVerification = {};
var ircVerificationReverse = {};

// Connect to IRC
_debug('irc', 'connecting');
var ircClient = new irc.Client(config['ircHostname'], 'NS2GatherSteam', {
	channels: config['ircChannels'],
});
ircClient.connect(3, function() {
	_debug('irc', 'connected');
	ircClient.say('Q@CServe.quakenet.org', 'AUTH ' + config['ircUsername'] + ' ' + config['ircPassword']);
})

// Connect to Steam
_debug('steam', 'connecting');
var steamClient = new Steam.SteamClient();
steamClient.logOn(config['steamUsername'], config['steamPassword']);

ircClient.addListener('error', function(message) {
	_debug('irc', error, message);
});

ircClient.addListener('message', function(from, to, message) {
	_debug('irc', 'message', from, to, message);
	if (message[0] == '.') {
		parseIrcCommand(from, to, message);
	}
});

ircClient.addListener('pm', function(from, message) {
	parseIrcCommand(from, from, message);
});

ircClient.addListener('join', function(channel, nick, message) {
	delete ircAuth[nick];
});

ircClient.addListener('part', function(channel, nick, message) {
	delete ircAuth[nick];
});

function ircCheckAuth(nick, callback) {
	if (typeof ircAuth[nick] != 'undefined') {
		console.log('bad');
		callback(ircAuth[nick]);
		return;
	}
	
	ircClient.whois(nick, function(whois) {
		_debug('irc', 'whois', whois['account']);
		if (typeof whois['account'] == 'undefined') {
			callback(null);
		}

		ircAuth[nick] = whois['account'];
		callback(whois['account']);
	});
}

var commands = {

	steam: function(user, channel, parts) {
		ircCheckAuth(user, function(account) {
			if (!account) {
				ircClient.say(channel, 'You need to be authenticated to use the Steam feature, see: http://www.quakenet.org/help/q/how-to-register-an-account-with-q');
				return;
			}

			if (typeof ircVerificationReverse[account] != 'undefined') {
				hash = ircVerificationReverse[account];
			} else {
				// Generate hash
				var hash = '';
				do {
					hash = '';

					for (var i = 0; i < 4; i++) {
						var code = Math.floor(Math.random()*25)+1 + 65;
						hash += String.fromCharCode(code);
					}

				} while (typeof ircVerification[hash] != 'undefined');

				ircVerification[hash] = account;
				ircVerificationReverse[account] = hash;
			}

			ircClient.say(user, 'Please add me on Steam: http://steamcommunity.com/profiles/76561198045040175');
			ircClient.say(user, 'Then send this code to verify your account: ' + hash);
		});
	},

	test: function(user, channel, parts) {
		_debug('irc', 'test');
		for (var nick in ircToSteam) {
			var steamId = ircToSteam[nick];
			_debug('irc', 'sending message to ' + nick + ' with steam ID ' + steamId);
			steamClient.sendMessage(steamId, "Test", Steam.EChatEntryType.ChatMsg);
		}
	},

	help: function(user, channel, parts) {
		ircClient.say(channel, 'Commands are .steam');
	}

}

function parseIrcCommand(user, channel, message) {
	if (message[0] == '.') {
		message = message.substring(1);
	}

	var parts = message.split(' ');

	try {
		var command = parts[0];
		commands[command](user, channel, parts.slice(1));
	} catch (err) {
		var response = 'Unknown command, try .help';
	}
}

// Steam Client

steamClient.on('error', function(e) {
	_debug('steam', 'error', e.cause);
});

steamClient.on('connected', function() {
	_debug('steam', 'connected');
});

steamClient.on('loggedOn', function() {
	_debug('steam', 'logged in as ' + config['steamUsername']);
	steamClient.setPersonaState(Steam.EPersonaState.Online);
	steamClient.setPersonaName(config['steamName']);
	steamClient.joinChat(config['steamGroupId']);
});

steamClient.on('message', function(chatId, message, type, userId) {
	_debug('steam', 'message', chatId, message, type, userId);

	if (typeof userId == 'undefined') {
		userId = chatId;
	}

	if (type == Steam.EChatEntryType.ChatMsg) {
		// Parse a verification code
		if (message.length == 4) {
			message = message.toUpperCase();
			if (typeof ircVerification[message] != 'undefined') {
				var account = ircVerification[message];
				delete ircVerification[message];

				ircToSteam[account] = userId;
				steamToIrc[userId] = account;

				steamClient.sendMessage(userId, "Thank you, you are now verified as " + account, Steam.EChatEntryType.ChatMsg);
			}
		}
	}
});

steamClient.on('chatInvite', function(chatRoomId, chatRoomName, userId) {
	_debug('steam', 'chatInvite', 'from', userId, 'to room', chatRoomId, chatRoomName);
	steamClient.joinChat(chatRoomId);
});

steamClient.on('relationship', function(userId, status) {
	_debug('steam', 'relationship', userId, status);
	if (status == Steam.EFriendRelationship.PendingInvitee) {
		steamClient.addFriend(userId);
	}
});

function _debug(/* tag, var1, var2, ... */) {
	if (!debug) {
		return;
	}

	var msg = '[' + arguments[0] + ']';

	for (var i = 1; i < arguments.length; i++) {
		msg += ' ' + arguments[i];
	}

	console.log(msg);
}