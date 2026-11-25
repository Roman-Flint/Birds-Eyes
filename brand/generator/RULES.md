# Rules for new Birds-Eyes Instagram posts

Used by the daily Instagram top-up when the list of ready-made posts runs out.

## Making a batch
1. Make a new batch file, `brand/generator/batch-NN.js` (next number), with 10 posts. Copy the shape of `batch-02.js`.
2. Number the post ids after the highest existing number in `brand/instagram-ads/` (e.g. `45-...`), with a short slug.
3. Render: `node brand/generator/render.js brand/generator/batch-NN.js`. Every line must say `ok`. If any says `FIX`, shorten that post's headline or text and render again.
4. Look at each image before using it.
5. Add a caption for each post to `brand/instagram-ads/captions.md` under `## <id>`.
6. Commit the batch file, images and captions, and push to `main`, so the images are online at `https://raw.githubusercontent.com/Roman-Flint/birds-eyes/main/brand/instagram-ads/<id>.jpg`.

## Content rules
- Never show or name the owner. No photos of people.
- Never mention buses, trains or public transport.
- No emojis, in images or captions.
- Only use the aerial photos in `assets/photos` (names without `-2048.jpg`).
- Only state facts that are on the website: prices (house shoot 5–10 photos $75, house shoot with video 10–20 photos + 30–90 s of 4K video $105, roof and property overview $90, small commercial 20–40 photos + 2–5 min of 4K video $135; prints A3 $20, A2 $32, A1 $45 matte, gloss +$5, framed +$40, 1–2 weeks), delivery by download link, the client doesn't need to be home, CAA Part 101 and airspace checked for every address, estimates confirmed by email before booking.
- Don’t keep saying “edited photos”: just say “photos”.
- Vary the main photo from one post to the next in a batch, so the same photo never appears in two posts in a row (`node brand/generator/photos.js` lists each post's main photo).
- Christmas or gift posts: use the `print` layout with `ribbon:true` (adds a red ribbon and bow).
- No made-up reviews, testimonials, client names, statistics or turnaround times.
- Don't repeat an existing post's headline. Pick topics that haven't been covered, or a fresh angle on one that has. Seasonal topics should suit the date they'll post (Auckland seasons; no Christmas posts after 12 December).
- Captions: first person, friendly and plain, 2–4 short sentences, end with "Link in bio." (or similar), then 5 hashtags including #dronephotography and #auckland.
