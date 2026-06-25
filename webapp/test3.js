const { YoutubeTranscript } = require('youtube-transcript');
async function test() {
  try {
    const transcript = await YoutubeTranscript.fetchTranscript('jNQXAC9IVRw');
    console.log(transcript[0]);
  } catch(e) {
    console.error('Error:', e.message);
  }
}
test();
