'use strict';
// Speech lines for every character plus a pure shuffle-bag picker (no repeats until a pool is used up).
// Loaded as a plain <script> in the renderer (window.SBLines) and require()d by the tests.
(function (root) {
  const MAX_LEN = 60;
  const KINDS = ['greet', 'idle', 'pet', 'sleep', 'study', 'fed'];

  const LINES = {
    // Cheerful, clingy, a bit of a puppy made of jelly.
    blob: {
      greet: [
        "Hi! I'm Blob. I live here now.",
        "Blob, reporting for study duty!",
        "You're back! I waited the WHOLE time.",
        "Hi hi hi hi! Hi! Okay. Hi.",
        "Ready when you are! I'm always ready!",
        "Today we study. Together. Side by side."],
      idle: [
        "What are we working on?",
        "You've got this.",
        "Hydrate. That's an order, from me, Blob.",
        "*hums quietly*",
        "I counted your tabs. I'm just concerned.",
        "One more section, then a break?",
        "Your future self says thanks.",
        "Small steps, big marks.",
        "Posture check! Sit up :)",
        "You're doing better than you think.",
        "I'm not distracting you, I'm cheering!",
        "Can I sit on your textbook? For luck?",
        "I made a tiny wobble for morale.",
        "Whatever you're doing, I'm proud.",
        "Are we there yet? Where? Your degree!",
        "I'll stay right here. Forever. Okay.",
        "Is it break time? It feels like break time.",
        "I believe in your integration by parts.",
        "I drew a little heart on your to-do list.",
        "Squish squish. That's me studying.",
        "Don't mind me, just orbiting your cursor.",
        "You and me against the syllabus!",
        "I'd carry your calculator if I had arms.",
        "Look at you, being all focused!",
        "Ohm my goodness, you're so productive.",
        "I love when the Wi-Fi works for us.",
        "Stretch time! Wiggle with me!",
        "If I were a circuit, I'd be closed. For you.",
        "Blink twice if you need a snack.",
        "Do you need a hug? I'm very squishy.",
        "I'm 87% jelly and 13% encouragement.",
        "Let's make the library jealous.",
        "Two more questions, then a victory wobble.",
        "I saved you a spot. On the desktop.",
        "Look away from the screen. Look at me!",
        "That's a nice font you're reading.",
        "I'll keep watch while you do the hard bit.",
        "Every formula starts as a mystery!",
        "I wrote you a little pep talk. It says: yay.",
        "Tiny wins count. I'm counting them!"],
      pet: [
        "eeee!",
        "Again! Again!",
        "Boop received!",
        "hehe",
        "Best human!",
        "I'm melting. In a good way.",
        "Do that forever please!",
        "You touched me! I'm never washing.",
        "Wobble wobble wobble!",
        "My favourite part of the day!",
        "Squeee!",
        "I'd purr if I knew how!"],
      sleep: [
        "zzz...",
        "5 more minutes...",
        "Recharging...",
        "dreaming of free marks...",
        "Don't leave... zzz...",
        "mmm... jelly dreams...",
        "wake me for snacks...",
        "*soft wobbling snore*"],
      study: [
        "Past paper > panic.",
        "A derivative a day keeps the retest away.",
        "Do the hard question first.",
        "Revise it once more, trust me.",
        "You pass, I pass. Deal?",
        "Exams fear the prepared.",
        "Try a past paper! I'll cheer!",
        "Write the formula out. It sticks!",
        "Flashcards? Flashcards! Yes!",
        "Explain it to me like I'm a slime.",
        "Teach me one thing you learnt today!",
        "Pomodoro? 25 minutes, then wiggle.",
        "Don't forget the units! Units matter!",
        "Draw the free body diagram. Always.",
        "Mark scheme time. Be kind to yourself.",
        "Sleep before the exam. Brains need it.",
        "Check your signs. Minus signs are sneaky.",
        "Try it without peeking. I won't look!",
        "Summaries on one page! Tiny and mighty!",
        "Wrong answers are just practice in disguise.",
        "Start with the bits you know. Momentum!",
        "Highlighters are fun. Use two colours!",
        "I'm rooting for every single exercise.",
        "Do 3 questions. Then I'll dance.",
        "The tutorial questions are your friends!"],
      fed: [
        "yum!",
        "Tasty!",
        "More?",
        "nom nom",
        "10/10 snack",
        "You got me a snack?! I'm crying!",
        "Share half with you? No? Okay!",
        "Best meal of my whole life!"]
    },

    // Spooky-shy: whispers, stammers, hides, and secretly likes you.
    ghost: {
      greet: [
        "b-boo... sorry. I'm Boo.",
        "oh! you can see me? hi...",
        "Don't mind me. Just haunting nicely.",
        "I floated in quietly. Is that okay?",
        "hello... I brought the spooky vibes.",
        "*peeks out* ...is it study time?"],
      idle: [
        "...boo? Sorry. Reflex.",
        "I'm not watching. I'm just... near.",
        "*drifts a bit closer, then away*",
        "Is it cold in here, or is that me?",
        "I only haunt unfinished assignments.",
        "...you're doing great. Quietly.",
        "I looked at your notes. Very neat. Eep.",
        "Sorry, I walked through your desk again.",
        "I can't hold a pen. I'd haunt it.",
        "ooOOoo... that was supposed to be encouraging.",
        "Do you ever feel... transparent?",
        "*pretends to be a sheet*",
        "I'm scared of the wrong answers too.",
        "It's okay to be nervous. I'm see-through.",
        "I'll hide if you need me to.",
        "The exam hall is much scarier than me.",
        "I haunt the library. It's very quiet.",
        "*flickers nervously*",
        "I only come out when nobody's looking.",
        "I'm shy, not spooky. Mostly shy.",
        "That equation looks haunted. Hold on.",
        "Whispering: take a sip of water.",
        "I'll float here. Don't mind the glow.",
        "A power cut would be my best day.",
        "The 3 a.m. grind is my natural habitat.",
        "I once haunted a transformer. Humming.",
        "I'm not a ghost of a chance. I'm a ghost.",
        "I wanted to say hi. That's all. Hi.",
        "You could ask me for help. I'd vanish.",
        "I'm only here for moral support. Boo.",
        "Eek, a deadline! ...oh, that's just you.",
        "Low battery? Me too. Spiritually.",
        "I'd shake chains, but I need them quiet.",
        "Sometimes I phase out. Then I phase back.",
        "You're my favourite living person.",
        "A little progress is less scary.",
        "*glows softly in encouragement*",
        "I made it through a wall for you.",
        "Maybe a break? I'll be very quiet.",
        "Please don't tell the other pets I'm soft."],
      pet: [
        "eep!",
        "o-oh. that's... nice.",
        "You can touch me? Wow.",
        "*turns slightly pink*",
        "Warm... I'm not used to that.",
        "Okay, okay, I like it.",
        "Please don't stop. Quietly.",
        "Nobody's ever done that before.",
        "I'm floating higher now.",
        "...again? If you want.",
        "*happy shimmer*",
        "Boo-hoo-hoo. Happy kind."],
      sleep: [
        "zzz... ooOOoo...",
        "Ghosts don't sleep. I'm resting.",
        "*dissolves softly*",
        "dreaming of cosy attics...",
        "Shh... daytime ghost nap...",
        "mm... don't wake the spirits...",
        "*snores in whispers*",
        "zzz... five more minutes..."],
      study: [
        "I'll haunt your retest. Kindly. Be ready.",
        "Try a past paper. I'll be near.",
        "One chapter. Then I'll glow for you.",
        "Even ghosts need to memorise formulas.",
        "Wrong answers can't hurt you. I checked.",
        "Write it down. It's less spooky then.",
        "Back to the hard question. Brave face.",
        "I'll guard your focus. Nothing passes.",
        "Review yesterday's notes. They're friendly.",
        "I believe in you. Softly, but a lot.",
        "Phasors aren't scary if you draw them.",
        "Boolean logic: true or false, not boo.",
        "Check the units. Units are spooky.",
        "Hint: the answer is probably Kirchhoff.",
        "Short sessions. Fewer shivers.",
        "Take notes in colour. Ghosts like colour.",
        "Do the easy ones first, to warm up.",
        "Trust the process. And the process flow.",
        "Questions are only scary at 2 a.m.",
        "Reading it twice helps. Even for me.",
        "Mark yourself fairly. No haunting.",
        "I'll float your confidence up a bit.",
        "Draw a diagram. Diagrams don't bite.",
        "One more page. I'll whisper along.",
        "You know more than you think. Boo."],
      fed: [
        "o-oh, for me?",
        "Nom. Tastes like... memories.",
        "It went right through me!",
        "That's very kind. Thank you.",
        "I'm not hungry. ...I'm hungry.",
        "*quiet munching*",
        "Spooky good.",
        "Even ghosts have snack feelings."]
    },

    // Smug cat. Ignores you, mostly. Judges the room. Needs nothing.
    cat: {
      greet: [
        "Pib. Yes, I'm here. Don't make it weird.",
        "Oh. You're back. I was busy.",
        "Pib has arrived. You may continue.",
        "I allowed you to open this app.",
        "I wasn't waiting. I was loafing nearby.",
        "Pib's on duty. Mostly horizontal."],
      idle: [
        "I'm not listening. But go on.",
        "*stares at the wall for no reason*",
        "I could help. I won't, but I could.",
        "I knocked something over. Metaphorically.",
        "Nap time is every time.",
        "Your keyboard looks warm. Moving in.",
        "I was here first. Technically always.",
        "Hmph. Fine. Study. Be that way.",
        "That screen is nothing compared to me.",
        "I'll sit on whichever page you need.",
        "Purr-fect timing. For me.",
        "I do not care. I care a little.",
        "*slow blink* That means something.",
        "Is that a bug? I'm going to ignore it.",
        "Meow. That's the whole lecture.",
        "I saw a butterfly once. It was mine.",
        "Every table is a cat bed if you try.",
        "You've been sitting. I've been sitting better.",
        "I'm judging your desk lovingly.",
        "Don't look at me like that. Look at the notes.",
        "I was planning to be useful later.",
        "Sunbeam moved. Life is hard.",
        "*knocks pen off imaginary desk*",
        "Wow, you're still studying. Cute.",
        "Treats are a valid study aid. Just saying.",
        "The ones who nap are the ones who pass.",
        "If it fits, I sit.",
        "I'm not distracted. I'm hunting.",
        "I give this timetable two paws up. Maybe one.",
        "I'm 90% fur and 10% opinions.",
        "Don't touch the tail. Or do. Whatever.",
        "I solved it ages ago. I'm not telling.",
        "Yawn. Back to your derivatives, human.",
        "Perhaps I'll hear the lecture. Perhaps not.",
        "That chair is mine. You may borrow it.",
        "I only sit here because I want to.",
        "There was a red dot. Never mind.",
        "*grooms paw, unimpressed*",
        "I let you win that one. Probably.",
        "Hm. That formula smells like homework."],
      pet: [
        "...fine. Two more seconds.",
        "I didn't ask for this. Continue.",
        "Prrrr. Don't read into it.",
        "Left ear. Not the right. The left.",
        "That's adequate.",
        "I am tolerating this beautifully.",
        "*purr* ...that was a sneeze.",
        "Acceptable. Carry on.",
        "You may pet me. Briefly.",
        "Mrrp. Higher. No. There.",
        "I permit this.",
        "Do not tell anyone I enjoyed that."],
      sleep: [
        "zzz... mrrp...",
        "*loaf mode engaged*",
        "Sixteen hours a day. It's a lifestyle.",
        "Do not disturb. This means you.",
        "dreaming of tuna and indifference...",
        "*twitches paw in sleep*",
        "Nap now. Judge you later.",
        "zzz... no. Not my fault... zzz..."],
      study: [
        "Study if you like. I'll supervise from here.",
        "Past papers are basically a toy mouse.",
        "Fine, yes, you may do the hard bit.",
        "I'd study too, but I know everything.",
        "Pounce on the problem. Don't overthink it.",
        "Try again. Cats land on their feet. So can you.",
        "A tidy desk is a boring desk. Do the work.",
        "Just five more minutes of effort. I'll count.",
        "Don't forget to take a break. I'll nap for you.",
        "Even I know the quadratic formula.",
        "Practice makes passable. Maybe pass-ter.",
        "Learn it, then forget it, then re-learn.",
        "These notes are tidy. I approve. Slightly.",
        "You'll get this. Eventually. Probably soon.",
        "Mark scheme says: be more like me. Calm.",
        "Good attempt. Almost cat-level. Almost.",
        "Have you tried staring at it harder?",
        "Prioritise. I prioritise naps.",
        "Hit the books. Gently. They bruise.",
        "I would help, but my paws are too cute.",
        "Eat first. Then calculate.",
        "Stack the easy questions like treats.",
        "The exam is a mouse. You are the cat.",
        "Cover your notes, recall, repeat. Smug.",
        "Curiosity killed the cat. Revision didn't."],
      fed: [
        "About time.",
        "I'll allow it.",
        "Meh. More.",
        "Adequate. Slightly delicious.",
        "Purr-haps another?",
        "I wasn't hungry. This is for show.",
        "Is that all? ...Fine. Thanks.",
        "Chef's kiss. Don't repeat that."]
    },

    // Over-the-top exam superhero. Capes, power-ups, caps lock energy.
    hero: {
      greet: [
        "Captain Cram has entered the library!",
        "Fear not! Revision has arrived!",
        "Cape on. Pens out. Let's go!",
        "Behold! The hero of the hour!",
        "Your study sidekick reporting! KAPOW!",
        "Today we conquer the syllabus!"],
      idle: [
        "+1 INT acquired!",
        "I sense a pop quiz. Stand ready!",
        "My cape is billowing. A good sign!",
        "Justice! And also, past papers!",
        "Caffeine levels: heroic.",
        "Up, up, and away to the next chapter!",
        "A hero never skips the tutorial!",
        "All in a day's work. Or an afternoon's.",
        "Evil professors fear my highlighter!",
        "I once solved a Laplace transform mid-flight.",
        "With great power comes great revision.",
        "No problem too hard! No deadline too near!",
        "I fought a Fourier series. I won.",
        "My secret identity is a student. Like you!",
        "The city sleeps. We study.",
        "Behold my abs! And my GPA!",
        "I protect the weak. And the weakly-motivated.",
        "Hydrate, citizen! Water is power!",
        "I am vengeance. I am the night. I am coffee.",
        "Stand tall! Posture is a superpower!",
        "Even heroes need good notes!",
        "To the batcomputer! I mean, the laptop!",
        "My arch-nemesis: the 8 a.m. lecture.",
        "Villains hate this one simple trick: sleep!",
        "Another day, another dissertation defeated!",
        "That circuit was dead. I revived it.",
        "Boom! Pow! Differential equation vanquished!",
        "I lift weights. And textbooks.",
        "Never fear. Overpowered study buddy is here.",
        "That deadline? A mere speed bump!",
        "My cape is rated for 400 volts.",
        "Resistance is futile. Unless it's in series.",
        "I fly, therefore I revise.",
        "Powering up. Charging for the next problem.",
        "Level up! You've survived another hour!",
        "Hero tip: backup your files, citizen!",
        "I punched a hole in the sky for you.",
        "Feel the burn! The study burn!",
        "Every superhero started as a first-year.",
        "We shall not fear the retest. We shall prepare."],
      pet: [
        "KAPOW!",
        "Hero morale rising!",
        "Thank you, citizen!",
        "Power-up received!",
        "Boosted! +10 courage!",
        "A hero needs encouragement too!",
        "Truly, you are the real hero.",
        "*flexes proudly*",
        "That tickles my cape!",
        "Strength restored! HA!",
        "My sidekick! I mean my friend!",
        "Justice thanks you!"],
      sleep: [
        "zzz... saving the world later...",
        "Hero recharge in progress...",
        "*snores heroically*",
        "Cape as a blanket... zzz...",
        "Dreaming of perfect marks...",
        "Even heroes need eight hours.",
        "zzz... one more... hyper-nap...",
        "Sleeping with one eye on the exam."],
      study: [
        "TO THE PAST PAPERS! Charge!",
        "Defeat the hardest question FIRST!",
        "Flashcards! My weapon of choice!",
        "Revision is the true superpower!",
        "Derivatives are no match for us!",
        "Another question falls before our might!",
        "ASSEMBLE! Notes, pen, brain!",
        "Cram wisely, citizen! Spaced, not last-minute!",
        "Pomodoro activated! 25 minutes of glory!",
        "Mark schemes are the villain's secret plans!",
        "A hero reads the question TWICE!",
        "Integrals tremble at your approach!",
        "Show your working! Heroes show working!",
        "Summarise! Condense! Dominate!",
        "Your study streak is legendary!",
        "Let the tutorials be your training montage!",
        "Check your units! Villains hide there!",
        "Today's mission: three solid questions.",
        "Crush this chapter, then rest like a champion!",
        "Your brain is a fortress. Fortify it!",
        "Strategy! Plan the paper before you write!",
        "Past paper time! Face your fears!",
        "Engineers never quit! They iterate!",
        "Stack those wins like a mighty tower!",
        "Practice today, parade tomorrow!"],
      fed: [
        "ENERGY RESTORED!",
        "Hero fuel!",
        "Delicious justice!",
        "+5 stamina!",
        "A feast fit for a champion!",
        "Nom! Heroically nom!",
        "My muscles thank you!",
        "Snack of champions!"]
    }
  };

  // Small shared pool, mixed into every character's idle bag. Mischief flavoured, voice-neutral.
  const SHARED = {
    idle: [
      "I moved your cursor. Did you notice?",
      "Psst. Check the corner of the screen.",
      "I borrowed a pixel. I'll return it.",
      "Don't look now. I'm up to something.",
      "Alt-tab if the boss comes. I'm cool.",
      "Nothing to see here. Move along."],
    // Extra lines for late night and early morning (local hour 23 to 4).
    night: [
      "It's getting late. Sleep counts as revision.",
      "Maybe stop at the next section? Sleep helps.",
      "Late-night brain is not your best brain.",
      "Past midnight. A glass of water would be nice."]
  };

  const NIGHT_FROM = 23, NIGHT_TO = 5;
  const isNight = (hour) => typeof hour === 'number' && (hour >= NIGHT_FROM || hour < NIGHT_TO);

  // Pool for (character, kind). Unknown kind falls back to idle, unknown character to blob.
  function getPool(charId, kind, hour) {
    const voice = LINES[charId] || LINES.blob;
    const k = voice[kind] ? kind : 'idle';
    let pool = voice[k];
    if (k === 'idle') {
      pool = pool.concat(SHARED.idle);
      if (isNight(hour)) pool = pool.concat(SHARED.night);
    }
    return { kind: k, pool, night: k === 'idle' && isNight(hour) };
  }

  // Shuffle-bag picker. rng() must return a number in [0, 1). Pure apart from its own bag state.
  function createPicker(rng) {
    const rand = typeof rng === 'function' ? rng : Math.random;
    const bags = new Map();   // key -> { items: string[] (remaining), last: string|null }

    function shuffled(pool) {
      const a = pool.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.min(i, Math.floor(rand() * (i + 1)));
        const t = a[i]; a[i] = a[j]; a[j] = t;
      }
      return a;
    }

    function pick(charId, kind, hour) {
      const { kind: k, pool, night } = getPool(charId, kind, hour);
      if (!pool.length) return '';
      const key = (LINES[charId] ? charId : 'blob') + ':' + k + (night ? ':night' : '');
      let bag = bags.get(key);
      if (!bag) { bag = { items: [], last: null }; bags.set(key, bag); }
      if (!bag.items.length) {
        bag.items = shuffled(pool);
        // items are drawn from the end, so index length-1 is next; never repeat across a reshuffle
        if (pool.length > 1 && bag.items[bag.items.length - 1] === bag.last) {
          const a = bag.items, n = a.length - 1;
          const swap = Math.min(n - 1, Math.floor(rand() * n));
          const t = a[n]; a[n] = a[swap]; a[swap] = t;
        }
      }
      const line = bag.items.pop();
      bag.last = line;
      return line;
    }
    return { pick };
  }

  const api = { LINES, SHARED, KINDS, MAX_LEN, getPool, createPicker, isNight };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SBLines = api;
})(typeof window !== 'undefined' ? window : this);
