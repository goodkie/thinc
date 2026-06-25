const { YoutubeTranscript } = require('youtube-transcript');
async function test() {
  try {
    const transcript = await YoutubeTranscript.fetchTranscript('jNQXAC9IVRw');
    console.log('Success!', transcript.length, 'segments');
  } catch(e) {
    console.error('Error:', e.message);
  }
}
test();
