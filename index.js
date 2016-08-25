var Discord = require('discord.js');
var request = require('request');
var ytdl = require('ytdl-core');
var fs = require('fs');
var wolframAlpha = require('wolfram-alpha');
var stringSimilarity = require('string-similarity');

var SOUNDCLOUD_ID = '2258648a49d582d15cd6a16d1b6c6f03';
var WOLFRAM_ID = '7V292V-4J2H5WXX5U';
var YOUTUBE_KEY = 'AIzaSyDcu72rzCqjpQ1cLcQWrpllLfhLVwhUMjE';
var GIPHY_KEY = 'dc6zaTOxFJmzC';
var DISCORD_TOKEN = 'MjEzNzI5NDM5ODE5ODkwNjg5.Co-q1A.4pCyJbu-tuAgDDQH3kKnF3EtsKM';

var hal = new Discord.Client();
var tts = false;
var jeopardy = JSON.parse(fs.readFileSync('jeopardy.json', 'utf8'));
var wolfram = wolframAlpha.createClient(WOLFRAM_ID);

var queue = [];
var shouldQueue = false;
var streamInChamber = false;
var textChannel;

var triviaMode = false;
var triviaScores = {};
var triviaAnswer;
var triviaValue;

console.log('Server ready');

hal.on('message', function(message) {
  if (message.author.username == 'hal') {
    return;
  }
  // var text = message.content.split(',');
  // hal.sendMessage(message.channel, stringSimilarity.compareTwoStrings(text[0], text[1]));
  // return;
  if(message.content.includes('hal ')) {
    message.content = message.content.replace('hal ', '');
    parse(message);
  } else if (triviaMode) {
    answerTriviaQuestion(message);
  }
});

function parse(message) {
  var m = message.content;
  if (similar(m, 'pause')) {
    pause();
  } else if (similar(m, 'resume')) {
    resume();
  } else if (similar(m, 'stop music')) {
    stopMusic();
  } else if (similar(m, 'skip')) {
    skip();
  } else if (m.includes('play')) {
    shouldQueue = false;
    play(message);
  } else if (m.includes('queue')) {
    shouldQueue = true;
    play(message);
  } else if (m.includes('gif')) {
    giphy(message);
  } else if (similar(m, 'start trivia') && !triviaMode) {
    startTrivia(message);
  } else if (similar(m, 'stop trivia')) {
    stopTrivia(message);
  } else if (similar(m, 'turn on voice')) {
    // tts = true;
  } else if (similar(m, 'turn off voice')) {
    // tts = false;
  } else if (m.includes('?')) {
    askWolfram(message);
  } else {
    hal.sendMessage(message.channel, "I'm sorry " + message.author + " but I'm afraid I can't do that.", {tts: tts});
  }
}

function similar(str1, str2) {
  return stringSimilarity.compareTwoStrings(str1, str2) > 0.6;
}

function pause() {
  hal.voiceConnection.pause();
}

function resume() {
  hal.voiceConnection.resume();
}

function stopMusic() {
  queue = [];
  streamInChamber = false;
  hal.voiceConnection.stopPlaying();
}

function skip() {
  hal.voiceConnection.stopPlaying();
}

function play(message) {
  if (!message.author.voiceChannel) {
    hal.sendMessage(message.channel, 'You are not connected to a voice channel')
    return;
  }

  var m = message.content;

  hal.joinVoiceChannel(message.author.voiceChannel);
  textChannel = message.channel;
  message.content = m.replace('play', '').replace('queue', '');
  hal.startTyping(textChannel);

  if (m.includes('youtube')) {
    youtube(message);
  } else if (m.includes('soundcloud')) {
    soundcloud(message);
  } else {
    youtube(message);
  }
}

function youtube(message) {
  var query = message.content.replace('from youtube', '').replace('youtube', '');

  if (query == '') {
    resume();
  }

  request({url: 'https://www.googleapis.com/youtube/v3/search', qs: {part: 'snippet', q: query, type: 'video', maxResults: '1', key: YOUTUBE_KEY}},
  function (error, response, body) {
    if (!error && response.statusCode == 200) {
      var data = JSON.parse(body);

      if (data.items.length == 0) {
        hal.sendMessage(message.channel, 'No videos found');
        hal.stopTyping(message.channel);
        return;
      }

      var title = data.items[0].snippet.title;
      var url = 'http://www.youtube.com/watch?v=' + data.items[0].id.videoId;
      var stream = ytdl(url, {filter: 'audioonly'});

      addStreamToQueue(stream, title);
    }
  });
}

function soundcloud(message) {
  var query = message.content.replace('from soundcloud', '').replace('soundcloud', '');

  request({url: 'http://api.soundcloud.com/tracks/', qs: {client_id: SOUNDCLOUD_ID, q: query}},
  function (error, response, body) {
    if (!error && response.statusCode == 200) {
      var data = JSON.parse(body);

      if (data.length == 0) {
        hal.sendMessage(message.channel, 'No tracks found');
        hal.stopTyping(message.channel);
        return;
      }

      var title = '';
      var url = '';

      var i = 0;
      var foundTrack = false;
      while (i < data.length && !foundTrack) {
        if (data[i].streamable) {
          foundTrack = true;
          url = data[i].stream_url;
          title = data[i].title;
        }
        i++;
      }

      var stream = request({url: url, qs: {client_id: SOUNDCLOUD_ID}}).pipe(require('stream').PassThrough());
      addStreamToQueue(stream, title);
    }
  });
}

function addStreamToQueue(stream, title) {
  if (shouldQueue) {
    queue.push({stream: stream, title: title});
    if (queue.length == 1 && !streamInChamber) {
      playback();
    } else {
      hal.sendMessage(textChannel, 'Queueing \"' + title + '\"');
      hal.stopTyping(textChannel);
    }
  } else {
    queue[0] = {stream: stream, title: title};
    hal.voiceConnection.stopPlaying();
    if (!streamInChamber) {
      playback();
    }
  }
}

function playback() {
  if (queue.length == 0) {
    streamInChamber = false;
    return;
  }
  hal.startTyping(textChannel);
  var streamData = queue.shift();
  streamInChamber = true;
  hal.voiceConnection.playRawStream(streamData.stream, {},
  function(error, intent) {
    if (error) {
      console.log(error);
      return;
    }
    hal.sendMessage(textChannel, 'Playing \"' + streamData.title + '\"');
    hal.stopTyping(textChannel);
    intent.on('end', function() {
      playback();
    });
  });
}

function giphy(message) {
  hal.startTyping(message.channel);
  var query = message.content.replace('find gif of', '').replace('gif of', '').replace('find gif', '').replace('gif', '');

  request({url: 'http://api.giphy.com/v1/gifs/search', qs: {q: query, limit: '1', api_key: GIPHY_KEY}},
  function (error, response, body) {
    if (!error && response.statusCode == 200) {
      var data = JSON.parse(body);

      if (data.data.length == 0) {
        hal.sendMessage(message.channel, 'No gifs found');
        hal.stopTyping(message.channel);
        return;
      }

      hal.sendFile(message.channel, data.data[0].images.original.url, 'file.gif');
      hal.stopTyping(message.channel);
    }
  });
}

function startTrivia(message) {
  triviaMode = true;

  runTrivia(message.channel);
}

function stopTrivia(message) {
  triviaMode = false;

  hal.startTyping(message.channel);

  var output = ''
  for (var name in triviaScores) {
    output += ('\n**' + name + '**: ' + triviaScores[name]);
  }
  hal.sendMessage(message.channel, output, {tts: tts});
  hal.stopTyping(message.channel);
}

function runTrivia(channel) {
  hal.startTyping(channel);
  do {
    var index = Math.floor(Math.random() * jeopardy.length);
    var question = jeopardy[index];
  } while (!question.value);
  askTriviaQuestion(channel, question);
  setTimeout(function() {
    if (triviaMode) {
      runTrivia(channel);
    }
  }, 30000);
}

function askTriviaQuestion(channel, question) {
  triviaAnswer = question.answer;
  triviaValue = Math.floor(question.value.substring(1).replace(/,/gi, ''));

  // console.log(question);

  var clue = question.question.substring(1, question.question.length - 1);
  clue = clue.replace(/<br\/>/gi, '\n').replace(/<br \/>/gi, '\n');
  clue = clue.replace(/<i>/gi, '*').replace(/<\/i>/gi, '*');
  var url = [];
  while (clue.includes('href')) {
    var hrefIndex = clue.indexOf('href');
    var urlIndex = clue.indexOf('\"', hrefIndex) + 1;
    var urlEndIndex = clue.indexOf('\"', urlIndex);
    url.push(clue.substring(urlIndex, urlEndIndex));
    var openTagIndex = clue.indexOf('<');
    var openTagEndIndex = clue.indexOf('>', openTagIndex) + 1;
    var closeTagIndex = clue.indexOf('<', openTagEndIndex);
    var closeTagEndIndex = clue.indexOf('>', closeTagIndex) + 1;
    clue = clue.substring(0, openTagIndex) + clue.substring(openTagEndIndex, closeTagIndex) + clue.substring(closeTagEndIndex, clue.length);
  }

  hal.sendMessage(channel, '**' + question.category + '** - ' + question.value + '\n' + clue);
  hal.stopTyping(channel);
  for (var i = 0; i < url.length; i++) {
    var extension = url[i].substring(url[i].length - 3);
    if (extension == 'jpg' || extension == 'peg' || extension == 'png' || extension == 'gif') {
      hal.sendFile(channel, url[i]);
    }
  }
}

function answerTriviaQuestion(message) {
  var similarity = stringSimilarity.compareTwoStrings(message.content, triviaAnswer);
  if (similarity > 0.5) {
    var name = message.author.username;
    console.log(name);
    if (!triviaScores[name]) {
      triviaScores[name] = triviaValue;
    } else {
      triviaScores[name] += triviaValue;
    }
    runTrivia(message.channel);
  }
}

function askWolfram(message) {
  wolfram.query(message.content, function (err, result) {
    if (err) throw err;
    if (result.length < 2) {
      hal.sendMessage(message.channel, "I'm sorry " + message.author + " but I'm afraid I can't do that.", {tts: tts});
      hal.stopTyping(message.channel);
      return;
    }

    var i = 0;
    var primaryFound = false;

    while (i < result.length && !result[i].primary) {
      i++;
    }

    var primaryResult;
    if (i >= result.length) {
      primaryResult = result[1].subpods[0];
    } else {
      primaryResult = result[i].subpods[0];
    }

    if (primaryResult.text == '') {
      hal.sendFile(message.channel, primaryResult.image, 'file.gif');
    } else {
      hal.sendMessage(message.channel, primaryResult.text, {tts: tts});
    }
    hal.stopTyping(message.channel);
  });
}

hal.loginWithToken(DISCORD_TOKEN);
