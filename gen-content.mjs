/**
 * Sinh content-lenamiu.json cho extension.
 *
 * Moi tweet ghep tu cac cau viet tay o duoi (mo dau + vai cau than bai theo
 * chu de + ket), them cau cho toi khi dai MIN_LEN-MAX_LEN ky tu theo cach X
 * dem (emoji tinh 2). Chua cho cho cum label extension gan vao duoi bai.
 *
 *   node gen-content.mjs              # 20000 cau, seed mac dinh
 *   node gen-content.mjs 15000 7      # so cau, seed
 *
 * Cung seed thi ra dung bo cau cu. Ghi de ca ban o goc (Tampermonkey tai tu
 * GitHub) lan ban dong goi trong chrome-extension.
 */
import fs from 'node:fs';

const COUNT = Number(process.argv[2]) || 20000;
const SEED = Number(process.argv[3]) || 20261012;
// Label mau 62 ky tu: 215 + 2 dong trong + 62 = 279, vua duoi 280. Label dai
// hon thi extension tu bo qua nhung cau khong vua, xem assignContent().
const MIN_LEN = 150;
const MAX_LEN = 215;
const THAI_SHARE = 0.1;
const OUTPUTS = ['content-lenamiu.json', 'chrome-extension/content-lenamiu.json'];

// ------------------------------------------------------------------ kho cau
// {a|b|c} = boc ngau nhien mot lua chon luc sinh. Moi lua chon phai dung ngu
// phap khi dat vao cau.

const EN_OPENERS = [
  "Okay, I need to talk about this.",
  "Can we take a moment for this?",
  "Real talk for a second.",
  "I've been thinking about this all day.",
  "Daily reminder, because it matters.",
  "Small appreciation post, because I can't help myself.",
  "Just saying what everyone's already thinking.",
  "Honestly, I'm not okay after {tonight|this episode|this week}.",
  "I said I'd stay calm about it. I lied.",
  "Friendly reminder for the timeline.",
  "Hear me out for a second.",
  "Here's my LenaMiu thought of the day.",
  "LenaMiu appreciation time, as always.",
  "Another day, another reason to love LenaMiu.",
  "If you're new here, let me explain.",
  "No thoughts, just LenaMiu.",
  "I keep coming back to this.",
  "Writing this down so I never forget it.",
  "To whoever needs to hear this today:",
  "Quick note before I go back to screaming.",
  "Still not over it, and I don't plan to be.",
  "Logging on just to say this.",
  "This is your sign to appreciate LenaMiu today.",
  "{Late night|Early morning|Midweek|Weekend} thoughts, as usual.",
  "Let me be dramatic for a minute.",
  "I don't usually post like this, but here we go.",
  "Something I need the whole world to know.",
  "I've said it before and I'll say it again.",
  "Not to be emotional on the timeline again, but here we go.",
  "Taking a quick break from {work|studying|my day} to say this.",
  "Can I be honest for a second?",
  "One thing I will never get tired of saying.",
  "Here's the thing.",
  "I've rewatched it {three|five|ten} times now, so let me talk.",
  "Putting this here for the record.",
  "My brain is fully LenaMiu-coded today.",
  "Me, every single day since I found LenaMiu:",
  "Just a reminder from a very proud fan.",
  "It's {Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday} and I'm thinking about LenaMiu again.",
  "Sorry, I have to be loud about this.",
  "I'm back with more LenaMiu thoughts.",
  "Plot twist: I am still not over LenaMiu.",
  "Can I just say something?",
  "Things I think about way too often:",
  "Appreciation post, no reason needed.",
  "Once again, I'm here to talk about LenaMiu.",
  "Okay, but let's be serious for a second.",
  "If nobody's said it today, I will.",
  "Opening the app just to say this.",
  "Honestly, there's so much I want to say.",
  "Every day I find a new reason, and today it's this.",
  "Brain empty, only LenaMiu.",
  "Gentle reminder to everyone scrolling past:",
  "I'm going to keep saying it until everyone agrees.",
  "Let's talk about LenaMiu for a minute.",
  "Fun fact about me: I'm always thinking about LenaMiu.",
  "There's no way I'm the only one who feels this.",
  "Okay, cards on the table.",
  "Today's mood is LenaMiu, and so is tomorrow's.",
  "A thought that won't leave my head:",
  "I need everyone to know this.",
  "Still thinking about {last night|the episode|that scene}, by the way.",
  "Okay, one more LenaMiu post and then I'll sleep. Maybe.",
  "Long post, because I have a lot of feelings.",
  "Let me tell you why I love LenaMiu so much.",
  "I need to get this off my chest.",
  "Nobody asked, but here are my thoughts.",
  "Sharing some love because they deserve it.",
  "Today's reminder from a very emotional fan:",
  "Here's something I think about every day.",
  "Good {morning|evening|night} to Lena and Miu only.",
  "Back again, because I can't stop thinking about LenaMiu.",
  "Let's be honest for a moment.",
  "If I could say one thing to the whole timeline, it would be this.",
  "Not me getting emotional about LenaMiu again.",
  "Okay, listen.",
  "For anyone wondering why I talk about LenaMiu so much:",
  "This might get long, but it's worth it.",
  "Can't sleep, thinking about LenaMiu as usual.",
  "I promised myself I'd post this today.",
  "I'll keep it short. Or I'll try.",
  "Some LenaMiu appreciation before I log off.",
  "Just here to spread some LenaMiu love.",
  "Let me gush for a second.",
  "I've been holding this in all day.",
  "Proud LenaMiu fan checking in.",
  "Here's my daily dose of LenaMiu love.",
];

const EN_CLOSERS = [
  "That's it, that's the tweet.",
  "I'll be here supporting them for as long as it takes.",
  "Forever proud of {these two|LenaMiu|Lena and Miu}.",
  "Never stop being yourselves, Lena and Miu.",
  "Sending all the love in the world their way.",
  "Please protect {them|these two} at all costs.",
  "Can't wait to see what they do next.",
  "We are so lucky to witness this.",
  "Counting down to the next episode already.",
  "My heart is so full right now.",
  "I'm never getting over this, and I'm fine with that.",
  "Rewatch, scream, repeat.",
  "Thank you for existing, LenaMiu.",
  "Keep shining, you two.",
  "I love them so much it's honestly embarrassing.",
  "This is why I'll always be a LenaMiu fan.",
  "They deserve the whole world and more.",
  "No one does it like LenaMiu.",
  "Please never change, LenaMiu.",
  "I'm so proud of how far they've come.",
  "Long live LenaMiu.",
  "See you all at the next episode.",
  "Okay, going back to rewatching now.",
  "Proud fan forever.",
  "All my love to Lena and Miu, today and always.",
  "This fandom is so lucky to have them.",
  "My favourite pair, now and always.",
  "I'll never get tired of saying it.",
  "That's all, I just needed to say it.",
  "Their future is so bright.",
  "Can't stop smiling because of them.",
  "They really are the best.",
  "Rooting for them, always.",
  "Nothing but love for these two.",
  "My heart belongs to LenaMiu, no questions asked.",
  "I'll be screaming about this all week.",
  "I'm not crying, you're crying.",
  "Excuse me while I rewatch everything again.",
  "I hope they know how loved they are.",
  "Their hard work deserves every bit of praise.",
  "Here for LenaMiu, today and every day.",
  "I'll support them through everything.",
  "Grateful for them every single day.",
  "Best decision I ever made was becoming a LenaMiu fan.",
  "Okay, I'm done. For now.",
  "Just had to get that out of my system.",
  "Truly one of a kind, both of them.",
  "Love you, Lena. Love you, Miu.",
  "Stay happy and healthy, Lena and Miu.",
  "This is only the beginning for them.",
  "Bring on the next episode!",
  "Seriously, how is anyone this lovely?",
  "Ten out of ten, no notes.",
  "My serotonin, my comfort, my LenaMiu.",
  "Proud to be part of this journey.",
  "Thank you for every smile, Lena and Miu.",
  "Let's keep showing them love.",
  "I'll be right here cheering for them.",
  "They make the world a little softer.",
  "Endless love for LenaMiu.",
  "Okay, back to screaming about them.",
  "Lena and Miu, you're doing amazing.",
  "Nobody is ready for how much I love them.",
  "Some things are just meant to be, and LenaMiu is one of them.",
  "That's my LenaMiu thought for today.",
  "Okay, I'll stop now. Maybe.",
  "Love them endlessly.",
  "I'm so lucky to be their fan.",
  "Sending all my support to Lena and Miu.",
  "They will always have my heart.",
  "See you at the next episode, everyone.",
  "Can't wait for what's coming next.",
  "Forever and always, LenaMiu.",
  "My heart is theirs, no refunds.",
  "Okay, back to rewatching for the hundredth time.",
  "Please keep supporting them, everyone.",
  "This is your reminder to watch Pls Love.",
  "Lena and Miu, you are so loved.",
  "So proud of them, always.",
  "Keep shining, Lena and Miu.",
  "The best is yet to come for them.",
  "I'll be here, cheering the loudest.",
  "And I'll say it again tomorrow.",
  "My favourites, today and always.",
  "That's all from me, for now.",
  "Let's keep the love going!",
];

// Cau Thai ngan gan duoi bai tieng Anh, kieu fan quoc te hay viet
const EN_THAI_TAILS = ['รักลีน่าหมิว', 'ลีน่าหมิวสู้ๆ', 'รักมากๆ เลย', 'ภูมิใจมาก', 'ลีน่าหมิวคือที่สุด'];

const EN_BODIES = {
  chemistry: [
    "The chemistry between Lena and Miu feels so natural that it's almost unfair to everyone else.",
    "Lena and Miu don't even need dialogue, one glance between them already tells the whole story.",
    "Every time Lena and Miu share a scene, the screen {just feels warmer|feels a little brighter|turns into pure comfort}.",
    "You can't fake the kind of chemistry LenaMiu have, it's simply there in every frame.",
    "They look at each other like the rest of the world {went quiet|stopped for a second|doesn't exist}.",
    "The way they bounce off each other makes every scene feel effortless.",
    "Their chemistry is the kind that makes you forget you're watching {a show|a series|fiction}.",
    "Lena's softness and Miu's sparkle balance each other perfectly.",
    "Lena and Miu together on screen is honestly my favourite kind of {magic|comfort|happiness}.",
    "LenaMiu have that rare chemistry where even the quiet moments feel loud.",
    "Some pairs just click, and LenaMiu clicked from the very first scene.",
    "Even their tiny reactions to each other feel completely genuine.",
    "The comfort between them shows in every little smile.",
    "Watching Lena and Miu together feels like watching two people who truly trust each other.",
    "I could watch {them|Lena and Miu} just sitting next to each other and still be entertained.",
    "Their energy together is soft, warm and so easy to love.",
    "There's a gentleness between Lena and Miu that you can feel through the screen.",
    "When LenaMiu laugh together, my whole mood {changes|lights up|gets better instantly}.",
    "Lena and Miu make every scene feel like it was written just for them.",
    "It's the small glances between {them|Lena and Miu} for me, every single time.",
    "Nobody does {soft|natural|gentle} chemistry quite like LenaMiu.",
    "Lena and Miu have the kind of connection you can't teach on set.",
    "Their teamwork is so smooth it looks like they've known each other forever.",
    "Every interaction between them feels honest and full of heart.",
    "Put Lena and Miu in the same frame and I'm automatically {smiling|happy|grinning}.",
    "The way Miu lights up whenever Lena is around is something I'll never get tired of.",
    "The way Lena looks at Miu in every scene deserves its own appreciation post.",
    "LenaMiu chemistry is the reason I can't skip a single minute.",
    "They make even the simplest scene feel {special|unforgettable|like a movie}.",
    "I didn't know two people could have this much natural chemistry until I saw LenaMiu.",
    "Lena and Miu fit together like they were always meant to share the screen.",
    "The trust between Lena and Miu makes every emotional scene hit twice as hard.",
    "LenaMiu can turn a simple conversation into the highlight of the whole episode.",
    "Their timing together is perfect, every reaction lands exactly right.",
    "Seeing Lena and Miu so comfortable with each other makes me so happy.",
    "LenaMiu together is comfort, chaos and sweetness all at once.",
    "Every scene with both of them feels like a warm hug.",
    "Lena and Miu's chemistry makes even a quiet moment feel like a love song.",
    "The softness in the way they look at each other is honestly too much for my heart.",
    "Lena and Miu just get each other, and you can see it in every scene.",
    "Lena and Miu {balance each other out|bring out the best in each other} in a way that feels so natural.",
    "The way LenaMiu move around each other in a scene feels {completely unscripted|so natural|like second nature}.",
    "Every little glance and every smile between Lena and Miu feels so genuine.",
    "LenaMiu turn the smallest moments into the ones I {replay the most|remember the longest|talk about all week}.",
    "Lena and Miu sharing one frame is all I need to be happy.",
    "Their chemistry makes me believe every single thing their characters feel.",
    "It's like Lena and Miu speak their own little language with just their eyes.",
    "LenaMiu prove that real chemistry is felt, not forced.",
    "You can feel the respect and care between Lena and Miu in every scene.",
    "Lena and Miu have a way of making even silence feel full of feeling.",
    "Every scene they share feels like a conversation only the two of them fully understand.",
    "I love how Lena and Miu never try to outshine each other, they lift each other up instead.",
    "The chemistry between LenaMiu feels warm, steady and completely real.",
    "One look from Lena and suddenly Miu's whole expression softens, and I melt every time.",
    "Miu's laugh next to Lena's calm smile is the perfect combination.",
    "LenaMiu make it look so easy to share a scene with someone you trust.",
    "Their connection on screen is the kind people spend years trying to find.",
    "Lena and Miu turn ordinary moments into the ones everyone keeps talking about.",
    "I keep noticing how naturally Lena and Miu move together in every frame.",
    "Some duos just belong together on screen, and Lena and Miu are proof of that.",
    "The easy comfort between LenaMiu makes every scene feel like home.",
    "The way they smile at each other between lines is my favourite detail.",
    "Lena and Miu could read a grocery list together and I'd still call it chemistry.",
    "LenaMiu's chemistry is so natural that every scene feels unscripted.",
    "You can tell how much Lena and Miu enjoy working together.",
    "Every scene with LenaMiu has that spark you just can't recreate.",
    "Their chemistry turns every small moment into something I want to replay.",
    "There's so much warmth in the way Lena and Miu talk to each other.",
    "Lena and Miu fit together like the last two pieces of a puzzle.",
  ],
  acting: [
    "Lena and Miu put so much heart into every scene, you can feel how much they care about this story.",
    "LenaMiu made me feel every single emotion in {that episode|this week's episode|the last scene}, and I'm still recovering.",
    "The way they handle the emotional scenes is honestly so impressive.",
    "Their acting keeps getting better and I'm so proud to watch it happen.",
    "Every expression feels real, nothing about LenaMiu's acting ever feels forced.",
    "LenaMiu can switch from sweet to heartbreaking in a second, and it works every time.",
    "The small details in their acting are exactly why I rewatch every scene.",
    "Lena and Miu made those characters feel like real people I actually know.",
    "Watching LenaMiu act reminds me how much work it takes to make something look this natural.",
    "The emotional scenes hit so hard because of how honest LenaMiu's acting is.",
    "Lena and Miu turned a simple moment into something I'll remember for a long time.",
    "They don't just play their roles, they {live in them|become them|give them a heartbeat}.",
    "I love how LenaMiu make the quiet moments just as powerful as the big ones.",
    "Every episode, Lena and Miu find a new way to surprise me.",
    "The tears, the laughter, the awkward little pauses, LenaMiu nailed all of it.",
    "LenaMiu's acting in the emotional scenes deserves so much more recognition.",
    "Nobody portrays longing quite like Lena and Miu do.",
    "Their acting has this honesty that makes it impossible to look away.",
    "LenaMiu make every line sound like it came straight from the heart.",
    "I believed every single word Lena and Miu said in that scene.",
    "The way LenaMiu use silence in their scenes is honestly brilliant.",
    "Lena and Miu bring so much depth to their characters, every scene has layers.",
    "That scene worked because Lena and Miu trusted each other completely.",
    "Every time I think LenaMiu can't top their last scene, they do it again.",
    "LenaMiu's acting made me laugh, cry and scream within the same episode.",
    "You can tell Lena and Miu really understand their characters.",
    "LenaMiu make it look easy, but that level of acting takes so much work.",
    "Their reactions feel so natural that it almost doesn't look like acting at all.",
    "Lena and Miu carried that emotional scene so beautifully.",
    "The way LenaMiu deliver even the simplest line gives me chills.",
    "LenaMiu make even the hardest emotional scenes look {effortless|completely natural|so honest}.",
    "The way Lena and Miu hold back their emotions in some scenes hurts in the best way.",
    "I'm still thinking about the way LenaMiu played {that last scene|that quiet moment|the ending}.",
    "Lena and Miu give every scene their full attention, and it really shows.",
    "LenaMiu's performances feel so lived in, like the characters existed before the cameras rolled.",
    "Lena and Miu never overdo it, every emotion lands exactly where it should.",
    "There's so much care in how LenaMiu build their characters scene by scene.",
    "Lena and Miu made me {cry|laugh out loud|scream} at my screen, and I mean that as a compliment.",
    "Watching LenaMiu act feels like watching real life, just softer.",
    "The way Lena and Miu react to each other makes every scene feel alive.",
    "Lena and Miu make difficult scenes look honest instead of dramatic.",
    "LenaMiu's acting feels so real that I sometimes forget it's a series.",
    "The emotional range Lena and Miu showed {this week|in this episode|lately} was incredible.",
    "Every pause, every glance, every breath, LenaMiu make it all count.",
    "Lena and Miu know exactly when to hold back and when to let it all out.",
    "LenaMiu took a quiet scene and made it the most memorable part of the episode.",
    "I love how Lena and Miu let their characters feel messy, real and human.",
    "LenaMiu's acting makes every emotion land right in my chest.",
    "The way Lena and Miu play off each other's reactions is so impressive.",
    "LenaMiu bring a softness to their acting that's rare and beautiful.",
    "Every scene Lena and Miu touch becomes more meaningful.",
    "Lena and Miu made me care about every single thing their characters went through.",
    "LenaMiu's performances deserve to be talked about for a long time.",
    "I can see how much thought Lena and Miu put into every scene.",
    "LenaMiu make every emotional beat feel earned.",
    "Watching Lena and Miu act feels like watching real feelings unfold.",
    "Lena and Miu turned those characters into people I'll remember.",
    "LenaMiu's honesty in every scene is what makes this series special.",
  ],
  lena: [
    "Lena has this calm, gentle presence that makes every scene feel safe.",
    "Lena's eyes {say so much|tell a whole story}, even when the scene is completely silent.",
    "Can we talk about how naturally Lena carries every emotional moment?",
    "Lena's smile honestly deserves its own {fan club|holiday|appreciation day}.",
    "Lena brings so much warmth to the screen, it's impossible not to root for the character.",
    "Lena makes acting look easy, but you can tell how much effort goes into every scene.",
    "Every time Lena laughs on screen, I laugh too, no exceptions.",
    "Lena's softness is one of my favourite things about this whole series.",
    "The way Lena delivers even the simplest line makes it feel important.",
    "Lena has grown so much as an actor and it shows in every episode.",
    "Lena's expressions in the {last|latest|newest} episode are still living in my head.",
    "Lena brings a quiet strength to every scene that I really admire.",
    "Lena is proof that kindness shows on screen.",
    "Lena's attention to the small details is what makes the character feel so real.",
    "I could listen to Lena talk about anything and still be happy.",
    "Lena's warmth is honestly the comfort I didn't know I needed.",
    "Lena never fails to bring something new and thoughtful to the role.",
    "Lena's gentle energy makes everyone around feel at ease.",
    "Every scene with Lena in it feels a little {brighter|warmer|softer}.",
    "Lena has such a kind heart, and it really shines through.",
    "Lena's elegance is something else, every frame looks like a painting.",
    "The way Lena handles the emotional scenes {breaks my heart in the best way|leaves me speechless|is so impressive}.",
    "Lena's laugh is the {softest, sweetest thing ever|sweetest sound in the world}.",
    "Lena makes every quiet moment feel full of meaning.",
    "I admire how much Lena cares about getting every scene right.",
    "Lena's calm energy balances out every chaotic moment perfectly.",
    "Lena looked so {beautiful|radiant|stunning|lovely} today, I had to stop scrolling.",
    "Nobody does a soft, longing look quite like Lena.",
    "Lena's sincerity is what makes the character so easy to love.",
    "Lena deserves every bit of love coming in right now.",
    "Lena's {gentle|soft|calm} smile is honestly my favourite thing on the internet right now.",
    "Lena gives every character a softness that makes them so easy to love.",
    "Lena's quiet moments on screen say more than a thousand words.",
    "Lena carries every scene with so much grace.",
    "Every time Lena is on screen, I forget to blink.",
    "Lena's hard work on this role really shows in every detail.",
    "Lena has a way of making sad scenes feel beautiful.",
    "I'm so proud of how much Lena has grown with every project.",
    "Lena's soft voice in the quiet scenes gives me chills.",
    "Lena has a calm confidence that makes every scene feel grounded.",
    "Lena's smile could honestly light up a whole city.",
    "Lena brings so much depth to the role without ever overdoing it.",
    "Lena's expressions tell a full story before a single word is spoken.",
    "Lena always looks so thoughtful and present in every scene.",
    "Lena's warmth comes through the screen in a way that's hard to explain.",
    "The way Lena listens in a scene is just as powerful as any line.",
    "Lena's gentle eyes are honestly my weakness.",
    "Lena has this graceful energy that makes everything feel calm.",
    "Lena makes the hardest scenes look natural and honest.",
    "I love how Lena's kindness shows in every little interaction.",
    "Lena keeps surprising me with how much emotion fits into one look.",
    "Lena is the definition of quiet brilliance.",
    "Lena's elegance in every frame never stops amazing me.",
  ],
  miu: [
    "Miu's energy is so bright, it {lights up every scene|makes every scene glow|lights up the whole screen}.",
    "Miu's expressions are a whole language of their own.",
    "Miu can make me laugh and cry in the same episode, and I love that so much.",
    "Miu's playful side is pure {serotonin|sunshine|joy}.",
    "Miu brings so much life to the character, it's impossible to look away.",
    "Every time Miu smiles, the whole scene feels {warmer|brighter|softer}.",
    "Miu's dedication to the role is so obvious in every detail.",
    "Miu makes the emotional moments hit so much harder.",
    "Miu has this charm that makes even a tiny moment unforgettable.",
    "Miu's comedic timing is honestly {so underrated|perfect|a gift}.",
    "Miu's eyes in the emotional scenes said everything words couldn't.",
    "Miu keeps growing as an actor and I'm so proud of the progress.",
    "Miu's laugh is officially my favourite {sound|sound in the world|thing to hear}.",
    "Miu's confidence on screen is something I really admire.",
    "Miu puts so much heart into everything, and it really shows.",
    "The way Miu reacts in every scene feels so natural and honest.",
    "Miu's sweetness is honestly {unmatched|on another level|out of this world}.",
    "Miu brings sunshine to every scene, even the sad ones.",
    "Miu never gives anything less than a hundred percent.",
    "Miu's bright energy is contagious, I smile every time.",
    "Miu's crying scene {broke me|wrecked me|stayed with me all night}, the emotion felt so real.",
    "Miu has a way of making every character feel lovable.",
    "Miu looked so {cute|gorgeous|lovely} today, I can't stop thinking about it.",
    "Miu's little reactions are honestly the {best part of every scene|reason I rewatch everything}.",
    "The sparkle in Miu's eyes is something no camera can fully capture.",
    "Miu makes being adorable look completely effortless.",
    "I love how fearless Miu is with every emotional scene.",
    "Miu's warmth makes everyone around feel welcome.",
    "Miu deserves every bit of love coming in right now.",
    "Miu turns even the simplest scene into something fun to watch.",
    "Miu's {bright|warm|sunny} smile could fix literally any bad day.",
    "Miu gives every scene a spark that makes it impossible to look away.",
    "Miu's emotional range in this series is honestly so impressive.",
    "Every time Miu is on screen, the whole mood gets brighter.",
    "Miu's hard work on this role really shows in every detail.",
    "Miu has a way of making happy scenes feel even happier.",
    "I'm so proud of how much Miu has grown with every project.",
    "Miu's playful energy and big heart are such a perfect combination.",
    "Miu's expressions are so honest, every feeling reaches the screen.",
    "Miu has a playful sparkle that makes every scene more fun.",
    "Miu's smile could honestly fix the worst day.",
    "Miu brings so much heart to the role without ever overdoing it.",
    "Miu's eyes carry a whole story in every emotional scene.",
    "Miu always brings an energy that makes every scene feel alive.",
    "Miu's sincerity shines through the screen every single time.",
    "Miu's laugh is the kind that makes everyone around smile too.",
    "Miu handles the heavy scenes with so much honesty.",
    "Miu's kindness shows in the smallest moments, and I love that.",
    "Miu keeps surprising me with how much range there is in every episode.",
    "Miu is the definition of bright, bold and lovable.",
    "Miu's cheerful energy is impossible not to love.",
    "Miu can turn a sad scene into something beautiful.",
    "The joy on Miu's face in the happy scenes is so contagious.",
  ],
  series: [
    "Pls Love has become the best part of my week, and LenaMiu are the reason why.",
    "Every new episode of Pls Love feels like a {gift|little treat|reward for surviving the week}.",
    "I wasn't ready for how much this series would make me feel.",
    "This series is so well made, and Lena and Miu carry it beautifully.",
    "The wait between episodes is {the longest part of my week|honestly torture}.",
    "I finished the episode and immediately wanted to watch it again.",
    "Every episode leaves me smiling and screaming at the same time.",
    "I've rewatched the latest episode more times than I'd like to admit.",
    "This story feels so much more special because of LenaMiu.",
    "The writing, the music, the acting, everything about this series feels made with love.",
    "Pls Love reminded me why I love watching stories like this.",
    "Every week I think the episode can't get better, and every week I'm wrong.",
    "I'm already counting down the {hours|days} until the next episode.",
    "This series gave me characters I genuinely care about.",
    "Not a single episode has disappointed me so far.",
    "The way this story unfolds slowly makes every moment feel earned.",
    "I can't believe how invested I am in this series already.",
    "The episodes keep getting better, and I'm so here for it.",
    "Pls Love is the kind of series I'll be recommending to everyone I know.",
    "Episode night is my favourite night of the week now.",
    "I cleared my whole schedule just to watch the new episode.",
    "That ending left me {speechless|screaming|staring at the screen} for a solid five minutes.",
    "The way this series handles emotions is so careful and so beautiful.",
    "Pls Love feels like comfort and heartbreak in the best possible way.",
    "Every episode of Pls Love goes by {way too fast|in a blink|far too quickly}.",
    "Pls Love has me emotionally invested in a way I didn't expect.",
    "I'm convinced Pls Love was made to test my heart every week.",
    "Pls Love is the {comfort series|weekly highlight|happy place} I didn't know I needed.",
    "I love how Pls Love takes its time with every emotional moment.",
    "Every episode ends and I immediately start counting down to the next one.",
    "Pls Love has the kind of moments that stay with you long after the episode ends.",
    "This series keeps surprising me in the best ways.",
    "Watching Pls Love every week has become a little ritual for me.",
    "The soundtrack, the colours and the acting all come together so beautifully in Pls Love.",
    "I didn't expect a series to make me this emotional, but here we are.",
    "Pls Love has quickly become one of my favourite series ever.",
    "This series treats its characters with so much care, and it shows.",
    "Each episode of Pls Love leaves me with a full heart and a long list of scenes to rewatch.",
    "I love how Pls Love balances the sweet moments with the emotional ones.",
    "Pls Love makes waiting a whole week feel like a lifetime.",
    "The story keeps pulling me in deeper every single episode.",
    "Pls Love is the series I recommend to anyone who asks.",
    "I didn't expect to get this attached to a story, but Pls Love did that.",
    "Every episode of Pls Love feels like it was made with so much love.",
    "This series has given me so many moments I'll never forget.",
    "Pls Love night is non negotiable in my house now.",
    "The way Pls Love builds every relationship slowly is beautiful.",
    "Pls Love keeps finding new ways to make me smile and cry.",
    "I'm so glad Pls Love exists and that LenaMiu are the heart of it.",
    "I will defend Pls Love and everyone in it forever.",
  ],
  support: [
    "Thank you, Lena and Miu, for all the hard work you put into this project.",
    "Whatever comes next, I'll be here supporting LenaMiu every step of the way.",
    "I hope Lena and Miu know how much happiness they bring to so many people.",
    "Sending so much love to LenaMiu and everyone working behind the scenes.",
    "I hope they're resting well and eating well, because they deserve it.",
    "Supporting LenaMiu has been one of the happiest things I've done this year.",
    "To Lena and Miu, thank you for sharing your talent with us.",
    "Please take care of yourselves, Lena and Miu, we'll always be here.",
    "Your hard work never goes unnoticed, LenaMiu.",
    "I'll keep supporting them loudly, today and every day.",
    "Lena and Miu deserve every bit of love they're getting and so much more.",
    "So grateful for everything LenaMiu share with their fans.",
    "I just want them to know they are appreciated, always.",
    "No matter how busy life gets, I'll always make time to support LenaMiu.",
    "Wishing Lena and Miu happiness, health and many more amazing projects.",
    "They work so hard, and seeing it pay off makes me so happy.",
    "Lena and Miu, please know you are loved by so many people around the world.",
    "I hope LenaMiu get some proper rest after all this hard work.",
    "Whatever LenaMiu do next, I'll be right there cheering.",
    "Supporting Lena and Miu is the easiest decision I've ever made.",
    "Here's to many more projects together, Lena and Miu.",
    "Sending so much love to Lena and Miu from {far away|across the world|my little corner of the internet}.",
    "I hope Lena and Miu always remember how proud we are of them.",
    "No matter what happens, LenaMiu will always have our support.",
    "Lena and Miu, thank you for {making every week brighter|giving us so many happy moments|sharing this story with us}.",
    "I'll keep showing up for LenaMiu, today, tomorrow and every day after that.",
    "May Lena and Miu always be surrounded by love and kindness.",
    "We see all the effort you put in, Lena and Miu, and we're so proud.",
    "Supporting LenaMiu will always be my favourite thing to do.",
    "Wishing LenaMiu nothing but happy days and good rest.",
    "Lena and Miu, every bit of your hard work is seen and appreciated.",
    "I hope LenaMiu feel all the love being sent to them today.",
    "Thank you, LenaMiu, for giving this story so much heart.",
    "Wherever Lena and Miu go next, I'll follow and cheer loudly.",
    "I'm so proud to support Lena and Miu, today and always.",
    "Please rest well, Lena and Miu, you've earned it.",
    "Lena and Miu deserve all the success and happiness in the world.",
    "Sending endless love and good energy to LenaMiu.",
    "I'll always be grateful that LenaMiu share their talent with us.",
    "No matter how big or small the project, I'll support LenaMiu.",
    "LenaMiu, keep shining, we're always right here behind you.",
    "I hope Lena and Miu know how many people smile because of them.",
    "Every day is a good day to show LenaMiu some love.",
    "I'll keep cheering for Lena and Miu until my voice gives out.",
    "Here's to Lena and Miu and every dream they're chasing.",
  ],
  comfort: [
    "{Bad day|Long day|Rough week}? One clip of LenaMiu and everything suddenly feels lighter.",
    "LenaMiu have become my comfort, and I didn't even see it coming.",
    "Whenever I feel tired, I rewatch LenaMiu's scenes and feel better instantly.",
    "There's something so calming about watching Lena and Miu together.",
    "Their smiles {fixed my whole mood today|turned my whole day around|made my entire week}.",
    "I came home exhausted, watched LenaMiu, and now I'm smiling like an idiot.",
    "LenaMiu content is my favourite way to {end a long day|start my morning|unwind after work}.",
    "Some people have {coffee|tea|a morning routine}, I have LenaMiu.",
    "They really are my serotonin on a bad day.",
    "I don't know how they do it, but they always make me feel better.",
    "Life got heavy this week, and LenaMiu made it lighter.",
    "My comfort show, my comfort pair, my comfort everything.",
    "Watching them laugh together is my favourite kind of therapy.",
    "LenaMiu turned an ordinary day into a good one.",
    "Some people meditate, I watch LenaMiu clips.",
    "LenaMiu are my happy place on days when nothing goes right.",
    "A LenaMiu scene a day keeps the stress away.",
    "I didn't know I needed LenaMiu in my life until they showed up.",
    "Watching Lena and Miu is the softest part of my day.",
    "Lena and Miu's smiles are my favourite cure for a long day.",
    "Whenever my day goes wrong, LenaMiu somehow make it right.",
    "Ten minutes of LenaMiu clips and my mood is completely fixed.",
    "LenaMiu are the warm blanket of my timeline.",
    "My stress disappears every time Lena and Miu laugh on screen.",
    "LenaMiu always know how to make my week feel lighter.",
    "LenaMiu are the reason my bad days end with a smile.",
    "A long day always feels shorter with a LenaMiu clip waiting at the end.",
    "Lena and Miu laughing together is the most peaceful thing I know.",
    "Whenever the world feels loud, LenaMiu make it quiet again.",
    "LenaMiu have become a little safe place in my everyday life.",
    "I put on a LenaMiu scene whenever I need to feel better.",
    "Nothing calms me down like watching Lena and Miu smile.",
    "LenaMiu are pure comfort in human form.",
    "My mood instantly improves the second Lena and Miu appear.",
    "Rough day, warm tea and LenaMiu clips, that's my recovery plan.",
    "LenaMiu are proof that happiness can come from the smallest moments.",
    "I'm so glad LenaMiu exist on days like this.",
  ],
  growth: [
    "You can see how much effort Lena and Miu put into every single scene.",
    "Their growth from the first episode until now has been amazing to watch.",
    "LenaMiu work so hard, and it shows in every little detail.",
    "I love seeing how they keep challenging themselves with every role.",
    "The dedication LenaMiu bring to their work is truly inspiring.",
    "Nothing about their success is luck, it's all hard work and heart.",
    "Every step of LenaMiu's journey makes me prouder than the last.",
    "They never stop learning, and it makes me admire them even more.",
    "LenaMiu have come so far, and I know they're only getting started.",
    "It's so inspiring to watch two people give their best every single time.",
    "LenaMiu keep raising the bar, and I keep being amazed.",
    "Every project makes Lena and Miu shine a little brighter.",
    "The progress Lena and Miu have made is something they should be so proud of.",
    "Hard work really does pay off, and LenaMiu are proof of that.",
    "It's been beautiful watching Lena and Miu grow as actors.",
    "Lena and Miu keep getting better, and I love watching every step.",
    "Every new episode shows how much LenaMiu have pushed themselves.",
    "The hard work Lena and Miu put in behind the scenes really shows on screen.",
    "It's so rewarding to watch LenaMiu's talent get the attention it deserves.",
    "LenaMiu never settle, they always aim higher, and it shows.",
    "Watching Lena and Miu improve with every episode makes me so proud.",
    "LenaMiu keep proving that hard work and heart always pay off.",
    "Every new scene shows how much Lena and Miu have grown.",
    "Lena and Miu never stop pushing themselves, and it really shows.",
    "LenaMiu's journey so far has been inspiring to watch.",
    "From the first episode to now, Lena and Miu have grown so much.",
    "LenaMiu are only getting better, and the best is still ahead.",
    "I admire how Lena and Miu keep learning and growing together.",
    "The effort LenaMiu put into their craft is so inspiring.",
    "Lena and Miu have worked so hard to get here, and it shows.",
  ],
  visuals: [
    "The visuals in every LenaMiu scene are honestly {unreal|out of this world|too good}.",
    "Lena and Miu looked absolutely {stunning|gorgeous|breathtaking} today, and I'm not over it.",
    "How do they look this good in literally every frame?",
    "LenaMiu could make any outfit look like it was made for them.",
    "Every photo of Lena and Miu together looks like a movie poster.",
    "Their styling today was perfect, and I'll be thinking about it all week.",
    "The way the camera loves LenaMiu should be studied.",
    "Lena's elegance and Miu's charm in one frame is too much for my heart.",
    "LenaMiu's photos today made me forget what I was doing.",
    "Every new photo of LenaMiu becomes my new wallpaper, I can't choose.",
    "The colours, the lighting and Lena and Miu in the middle of it all, perfection.",
    "The way LenaMiu glow in every scene isn't just good lighting.",
    "Lena and Miu standing side by side is the prettiest thing I've seen all week.",
    "Lena and Miu's {photos|outfits|looks} today were absolutely perfect.",
    "The camera was made for LenaMiu, I'm convinced.",
    "LenaMiu's visuals are honestly a full time job for my heart.",
    "Every frame with Lena and Miu could be hung in a gallery.",
    "I stopped scrolling the second I saw Lena and Miu's new photos.",
    "Lena and Miu in the same frame is honestly a work of art.",
    "Every LenaMiu photo looks like it belongs on a magazine cover.",
    "LenaMiu's visuals today made my whole timeline prettier.",
    "The way the light hits Lena and Miu in every scene is unreal.",
    "Lena's elegance next to Miu's sparkle is the perfect picture.",
    "LenaMiu never miss when it comes to visuals.",
    "Every new LenaMiu photo instantly becomes my favourite one.",
    "Lena and Miu looked so {lovely|radiant|beautiful} together today.",
    "LenaMiu could turn any background into a postcard.",
    "I need a whole album just for today's LenaMiu photos.",
  ],
  fandom: [
    "Being part of this fandom has brought me so many good moments and good friends.",
    "I love how kind and supportive this fandom is to Lena and Miu.",
    "Our fandom showing up for LenaMiu every week makes me so proud.",
    "Finding LenaMiu was the best thing that happened to {my timeline|my year|me this year}.",
    "Shoutout to everyone who's been supporting LenaMiu since the beginning.",
    "I love seeing new fans fall in love with LenaMiu every week.",
    "This fandom always shows up, and LenaMiu deserve nothing less.",
    "Let's keep spreading love for LenaMiu everywhere we go.",
    "To every new fan joining us, welcome, you're going to love it here.",
    "LenaMiu fans really are the sweetest people on this app.",
    "I love how this fandom celebrates every little LenaMiu moment together.",
    "Watching this fandom grow alongside Lena and Miu has been so special.",
    "Every week this fandom shows up for LenaMiu and it never gets old.",
    "We support LenaMiu loudly and kindly, that's how it should be.",
    "This fandom and LenaMiu together feel like one big family.",
    "I love how this fandom lifts LenaMiu up every single week.",
    "Being a LenaMiu fan means always having something to smile about.",
    "Huge love to everyone keeping the LenaMiu love going today.",
    "This fandom's love for Lena and Miu is honestly heartwarming.",
    "Our fandom's love for LenaMiu keeps growing every single day.",
    "I'm so proud of how this fandom supports Lena and Miu with kindness.",
    "Every LenaMiu fan I've met has been so lovely.",
    "This fandom turns every LenaMiu moment into a celebration.",
    "Let's keep the timeline full of love for Lena and Miu.",
    "New fans keep finding LenaMiu, and I love welcoming them.",
    "This fandom shows what happens when people support with their whole hearts.",
    "LenaMiu fans really know how to make a timeline glow.",
    "The love this fandom gives LenaMiu always makes me emotional.",
    "Together, this fandom makes sure Lena and Miu always feel supported.",
  ],
  rewatch: [
    "I've rewatched that scene so many times I could act it out myself.",
    "Some LenaMiu moments live in my head rent free, and I'm not even mad about it.",
    "Rewatching old LenaMiu clips {at midnight|before bed|on my lunch break} is my new favourite habit.",
    "Every rewatch, I notice a new little detail I missed before.",
    "That one look between them is permanently saved in my memory.",
    "I keep pausing every scene just to take in every expression.",
    "My camera roll is now ninety percent LenaMiu, and I have no regrets.",
    "I'll never get tired of watching those moments again and again.",
    "I've lost count of how many times I've rewatched {that scene|the last episode|their behind the scenes clips}.",
    "Rewatching from episode one just to see how far they've come.",
    "Every rewatch somehow makes me love LenaMiu even more.",
    "I've watched {that scene|that moment|the ending} so many times, I know every line by heart.",
    "Rewatching LenaMiu scenes has officially replaced my sleep schedule.",
    "Every time I rewatch, Lena and Miu break my heart all over again.",
    "I'll rewatch LenaMiu's scenes a hundred more times and still not be tired.",
    "My watch history is basically just LenaMiu at this point.",
    "I rewatched the episode again and loved LenaMiu even more.",
    "Every rewatch of LenaMiu's scenes feels like the first time.",
    "I've seen those scenes so many times and they still get me.",
    "Rewatching LenaMiu moments is my favourite way to spend free time.",
    "I keep rewinding LenaMiu's scenes just to catch every expression.",
    "Rewatch number who knows what, and Lena and Miu still make me smile.",
    "I rewatch LenaMiu clips whenever I need a little joy.",
    "My favourite LenaMiu scenes are on repeat in my head all day.",
    "There's always something new to notice when I rewatch Lena and Miu.",
    "I'll never get tired of rewatching LenaMiu, not even a little.",
  ],
  feelings: [
    "My heart can't handle how {sweet|cute|precious} Lena and Miu are.",
    "I didn't expect to fall this hard for LenaMiu, but here we are.",
    "LenaMiu have taken over my heart, my timeline and my entire week.",
    "I smiled through the whole {episode|clip|scene} and now my cheeks hurt.",
    "I'm so emotionally attached to them, and I wouldn't change it.",
    "Every LenaMiu moment makes me fall in love with them all over again.",
    "There's no going back, I'm officially a LenaMiu fan for life.",
    "I didn't plan on getting this attached, but LenaMiu made it impossible not to.",
    "I literally screamed into my {pillow|hands|blanket} because of LenaMiu.",
    "My heart does a little jump every time LenaMiu appear on screen.",
    "I'm smiling at my phone like a fool because of Lena and Miu again.",
    "LenaMiu make me feel things I didn't know a series could make me feel.",
    "Being a LenaMiu fan is honestly the best mood booster.",
    "I keep telling myself I'll be normal about LenaMiu, and I keep failing.",
    "My love for LenaMiu grows every single day, and it's nowhere near stopping.",
    "LenaMiu have no idea how much happiness they bring to my everyday life.",
    "I'm emotionally invested in Lena and Miu, and there's no going back.",
    "Every LenaMiu scene makes my heart feel a little fuller.",
    "I love Lena and Miu more than I can put into words.",
    "Some days I wonder how I lived before finding LenaMiu.",
    "LenaMiu have a special place in my heart that nobody can replace.",
    "Thinking about Lena and Miu makes my whole day brighter.",
    "I'm completely, hopelessly attached to LenaMiu and I'm proud of it.",
    "Every LenaMiu moment makes my heart a little warmer.",
    "I didn't know I could care this much about Lena and Miu, but I do.",
    "LenaMiu make me happier than I can explain.",
    "My love for Lena and Miu is honestly so loud.",
    "Being a LenaMiu fan has made this year so much brighter.",
    "I get excited every time I see a new LenaMiu moment.",
    "LenaMiu are my favourite part of every single week.",
    "My heart is fully LenaMiu's at this point.",
    "LenaMiu make me feel like a kid again, giddy and happy.",
  ],
};

// Bai viet tron, dung nguyen van
const EN_STANDALONE = [
  "Every week I tell myself I'll stay calm during the episode, and every week Lena and Miu prove me wrong. I don't know how they do it, but I'm grateful they do.",
  "Some people find comfort in music or books. I found mine in watching Lena and Miu smile at each other on screen, and I wouldn't trade it for anything.",
  "If you ever need proof that hard work and kindness shine through, just watch LenaMiu. Every scene, every smile, every little detail is full of heart.",
  "I started watching Pls Love for the story, but I stayed for Lena and Miu. Their chemistry turned a good series into something truly special for me.",
  "The best part of my week is sitting down for a new episode and watching Lena and Miu make me feel everything all over again.",
  "Lena and Miu, thank you for every laugh, every tear and every moment of comfort you've given us. Please know how loved and appreciated you both are.",
  "I'll never get over how naturally Lena and Miu fit together on screen. It doesn't feel like acting, it feels like watching two people who truly care.",
  "It's amazing how LenaMiu can make one quiet scene feel louder than an entire episode. That's talent, that's chemistry, and that's why I love them.",
  "Watching LenaMiu grow with every episode has been such a joy. They keep getting better, and I'll keep cheering for them every step of the way.",
  "Just finished rewatching the latest episode and I still have the biggest smile on my face. LenaMiu really know how to make a whole day better.",
  "I love how Lena brings calm and Miu brings sparkle, and together they bring something nobody else can. That's LenaMiu for you.",
  "Can't stop thinking about the way Lena and Miu looked at each other in that scene. Some moments just stay with you, and that's one of them.",
  "Whenever life feels heavy, I rewatch my favourite LenaMiu scenes. Somehow they always remind me that soft and happy moments still exist.",
  "To everyone who hasn't watched Pls Love yet: please give it a try. Lena and Miu put their whole hearts into it, and you can feel it in every scene.",
  "Some pairs are good together. LenaMiu are something else entirely. The trust, the warmth, the timing, it's all there in every single frame.",
  "Lena and Miu make me believe every word they say on screen. That kind of honesty in acting is rare, and I'm so happy we get to witness it.",
  "I came for one episode and now I'm here every week, screaming, crying and smiling at my screen. Thank you, LenaMiu, for ruining me in the best way.",
  "My favourite thing about LenaMiu is how genuine everything feels. Their smiles, their reactions, their care for each other, none of it feels forced.",
  "The happiness LenaMiu bring to this fandom is something special. I hope Lena and Miu know how many people they make smile every single week.",
  "Every time I see Lena and Miu on screen together, my whole day gets better. I don't know what kind of magic that is, but I'll take it.",
  "Rewatching from the first episode makes me realise how much LenaMiu have grown. So proud of them, and so excited for everything that comes next.",
  "I could write a whole essay about Lena's soft looks and Miu's bright smile, but the short version is this: LenaMiu are perfect together.",
  "Not a single scene goes by without me noticing a new little detail Lena and Miu added. That's how much care they put into their work.",
  "The way this fandom shows up for Lena and Miu every week makes me so proud. Let's keep spreading the love, because they truly deserve it.",
  "Late night, headphones on, rewatching LenaMiu scenes for the hundredth time. This is my self care routine now, and I refuse to apologise for it.",
  "Lena and Miu have this way of making every scene feel like home. Warm, safe and full of love. I'm so lucky I found them.",
  "Episode night means snacks ready, phone charged and heart prepared to be destroyed by Lena and Miu once again. I'm ready. I think.",
  "I've recommended Pls Love to all my friends, and every single one of them came back obsessed with LenaMiu. Mission accomplished.",
  "Lena and Miu deserve every compliment and every bit of love coming their way. Their hard work speaks for itself, and I'm so proud of them.",
  "The softest pair, the strongest chemistry and the kindest hearts. That's how I'd describe LenaMiu to anyone who asks.",
  "Every time I think I can't love LenaMiu more, they show up with another scene that proves me wrong. Never stop surprising us, you two.",
  "Lena's gentle eyes and Miu's bright laugh in the same scene should come with a warning. My heart was not prepared at all.",
  "Thank you, Lena and Miu, for working so hard on this series. Every scene shows how much you care, and we notice everything.",
  "If you're having a hard day, here's your reminder that LenaMiu exist and they're doing amazing. Go watch a clip, you'll feel better.",
  "I don't think I'll ever get tired of watching Lena and Miu laugh together. It's genuinely one of the happiest things on my timeline.",
  "Every week I promise myself I won't get this emotional about Pls Love, and every week Lena and Miu make that promise impossible to keep. I wouldn't have it any other way, honestly.",
  "If someone asked me why I love LenaMiu, I'd tell them to watch one scene. The way Lena and Miu look at each other, the trust, the warmth, it explains everything better than I could.",
  "Lena and Miu, I hope you know how much joy you bring to people all over the world. Every smile, every scene, every little moment you share with us makes so many days brighter.",
  "Some days are heavy, but there's always one thing that makes me feel lighter: watching Lena and Miu laugh together. Thank you for being that comfort for so many of us.",
  "I love how Lena brings calm and Miu brings sunshine, and somehow together they create something so warm and honest. That's the magic of LenaMiu, and I'll never get tired of it.",
  "Watching LenaMiu grow with every episode has been one of the happiest parts of my year. So proud of everything they've done, and so excited for everything still to come.",
  "I came for the story, stayed for the chemistry, and now I'm a LenaMiu fan for life. Pls Love gave me so much more than I expected, and Lena and Miu are the reason why.",
  "The small details are what get me. A glance from Lena, a soft smile from Miu, a pause that says everything. LenaMiu put so much care into every moment, and it shows.",
  "To everyone just discovering LenaMiu: welcome, you're in for something special. Lena and Miu will make you laugh, cry and rewatch every scene more times than you can count.",
  "I've rewatched the latest episode more times than I can count, and every time I notice something new. That's how much heart Lena and Miu put into this story.",
  "Lena and Miu, please take care of yourselves. Rest well, eat well, and know that there are so many people cheering for you every single day, wherever you are.",
  "My favourite thing about LenaMiu is how real it all feels. Nothing forced, nothing fake, just two people giving their whole hearts to a story and to each other on screen.",
  "Whenever someone asks me for a series recommendation, I say Pls Love without thinking. Then I spend twenty minutes explaining why Lena and Miu are the best part of it.",
  "This fandom, this series and these two incredible people have made this year so much better. Thank you, Lena and Miu, for everything you share with us.",
  "Lena's gentle strength and Miu's bright heart are the perfect match. Every scene they share feels like a little gift, and I'm so grateful we get to watch them shine.",
];

const TH_OPENERS = [
  'ขอพูดหน่อยนะ',
  'วันนี้ก็ยังคิดถึงลีน่าหมิวเหมือนเดิม',
  'บอกเลยว่าไม่ไหวแล้วจริงๆ',
  'ดูจบแล้วแต่ใจยังไม่จบ',
  'โพสต์ชื่นชมประจำวันมาแล้ว',
  'ใครยังไม่ได้ดูต้องไปดูด่วนเลย',
  'คืนนี้นอนไม่หลับเพราะลีน่าหมิวอีกแล้ว',
  'ต้องมาพิมพ์ไว้ก่อนจะลืม',
  'เตือนความจำประจำวัน',
  'ขอเสียงดังหน่อยนะ',
  'พูดกี่ครั้งก็ไม่เบื่อ',
  'ยังไม่หายอินเลย',
  'ขอเวลาชื่นชมลีน่าหมิวแป๊บนึง',
  'มาอีกแล้วกับความคิดถึงลีน่าหมิว',
  'ตั้งแต่ได้รู้จักลีน่าหมิว ชีวิตก็มีแต่รอยยิ้ม',
  'มาแล้วจ้า โพสต์รักลีน่าหมิวประจำวัน',
  'ขอเล่าความรู้สึกหน่อยนะ',
  'คิดถึงลีน่าหมิวทั้งวันเลย',
  'อยากบอกให้โลกรู้ว่า',
  'เพิ่งดูจบ ยังตื่นเต้นไม่หาย',
  'วันนี้ก็เป็นอีกวันที่รักลีน่าหมิว',
  'เขียนไว้ตรงนี้เลยนะ',
  'คืนนี้ขอพูดถึงลีน่าหมิวหน่อย',
];

const TH_CLOSERS = [
  'รักลีน่าหมิวที่สุด',
  'จะซัพพอร์ตตลอดไปนะ',
  'เป็นกำลังใจให้เสมอ',
  'ขอบคุณที่ทำให้มีความสุขขนาดนี้',
  'รอตอนต่อไปอยู่นะ',
  'ภูมิใจในตัวสองคนนี้มากจริงๆ',
  'ใจฟูมากวันนี้',
  'ไม่ไหวแล้วจริงๆ',
  'รักมากๆ เลย',
  'สู้ๆ นะลีน่าหมิว',
  'ลีน่าหมิวคือที่สุด',
  'จะอยู่ตรงนี้ตลอดไป',
  'ดูกี่รอบก็ไม่เบื่อ',
  'ขอบคุณลีน่ากับหมิวนะ',
  'รักและภูมิใจเสมอ',
  'ไปดูซ้ำต่อแล้วนะ',
  'มีความสุขมากจริงๆ',
  'ลีน่าหมิวต้องไปได้ไกลแน่นอน',
  'รักลีน่าหมิวไม่เปลี่ยนแปลง',
  'จะเป็นกำลังใจให้ทุกวันเลยนะ',
  'รอดูผลงานต่อไปอยู่นะ',
  'ขอบคุณที่เป็นแรงบันดาลใจให้กันนะ',
  'ลีน่าหมิวน่ารักที่สุดในโลก',
  'ภูมิใจที่ได้เป็นแฟนคลับ',
  'อยู่ด้วยกันไปนานๆ นะ',
  'มีความสุขที่ได้เห็นสองคนนี้',
];

const TH_BODIES = {
  chemistry: [
    'เคมีของลีน่ากับหมิวเป็นธรรมชาติมาก ดูแล้วอินตามทุกฉากเลย',
    'ลีน่าหมิวแค่มองตากันก็เล่าเรื่องได้หมดแล้ว',
    'ทุกครั้งที่ลีน่ากับหมิวอยู่ในฉากเดียวกัน หน้าจอดูอบอุ่นขึ้นทันที',
    'สองคนนี้แค่นั่งข้างกันเฉยๆ ก็น่ารักแล้ว',
    'เวลาลีน่าหมิวหัวเราะด้วยกัน ใจเราก็ฟูตามไปด้วย',
    'ความเข้าขากันของลีน่าหมิวคือที่สุดจริงๆ',
    'ลีน่าหมิวอยู่ด้วยกันแล้วดูสบายใจมาก ดูแล้วมีความสุขตาม',
    'สายตาที่ลีน่ามองหมิวคือบอกทุกอย่างแล้ว',
    'หมิวยิ้มทุกครั้งที่ลีน่าอยู่ใกล้ๆ น่ารักมากจริงๆ',
    'เคมีแบบนี้หาไม่ได้ง่ายๆ เลย ลีน่าหมิวคือคู่ที่ใช่',
    'ลีน่ากับหมิวเข้ากันได้ดีมาก ดูแล้วไม่เหมือนการแสดงเลย',
    'แค่ลีน่าหมิวยิ้มให้กันก็ใจละลายแล้ว',
    'ลีน่ากับหมิวมองตากันทีไรใจละลายทุกที',
    'สองคนนี้เข้าขากันดีมาก ดูแล้วอบอุ่นหัวใจ',
    'เคมีของลีน่าหมิวทำให้ทุกฉากดูมีชีวิต',
  ],
  acting: [
    'การแสดงของลีน่าหมิวพัฒนาขึ้นทุกตอน ภูมิใจมากจริงๆ',
    'ฉากซึ้งทำเอาน้ำตาไหลเลย ลีน่าหมิวเล่นถึงมาก',
    'ลีน่าหมิวถ่ายทอดอารมณ์ได้ดีมาก เชื่อทุกคำพูดเลย',
    'ทุกสีหน้าทุกแววตาของลีน่าหมิวดูจริงมาก ไม่มีฝืนเลย',
    'ลีน่ากับหมิวทำให้ตัวละครมีชีวิตขึ้นมาจริงๆ',
    'ดูแล้วรู้เลยว่าลีน่าหมิวตั้งใจกับบทนี้มากแค่ไหน',
    'ฉากเงียบๆ ก็ยังทรงพลัง เพราะลีน่าหมิวเล่นได้ละเอียดมาก',
    'ลีน่าหมิวเล่นฉากเงียบๆ ได้ทรงพลังมาก ดูแล้วขนลุกเลย',
    'ทุกฉากของลีน่าหมิวมีรายละเอียดเล็กๆ ที่ทำให้อินตามได้ง่ายมาก',
    'ลีน่าหมิวเล่นฉากอารมณ์ได้ลึกมาก ดูแล้วอินสุดๆ',
    'ชอบความละเอียดในการแสดงของลีน่าหมิวมาก',
    'ทุกฉากของลีน่าหมิวดูเป็นธรรมชาติ ไม่มีฝืนเลย',
  ],
  lena: [
    'ลีน่ามีความอ่อนโยนที่ทำให้ทุกฉากดูอบอุ่น',
    'แววตาของลีน่าบอกอะไรได้เยอะมาก แม้จะไม่มีบทพูดเลยก็ตาม',
    'รอยยิ้มของลีน่าคือที่สุดจริงๆ',
    'ลีน่าเล่นฉากซึ้งได้ดีมาก ดูแล้วใจสลายตามเลย',
    'ลีน่าวันนี้สวยมาก ละสายตาไม่ได้เลย',
    'ลีน่าเก่งขึ้นทุกวันจริงๆ ภูมิใจมาก',
    'เสียงหัวเราะของลีน่าน่ารักที่สุด',
    'ลีน่าดูนิ่งแต่ลึกซึ้ง ทุกฉากมีความหมายไปหมด',
    'ลีน่ายิ้มทีไรโลกสดใสขึ้นทันที',
    'ลีน่าตั้งใจกับบทนี้มาก เห็นได้ชัดในทุกฉาก',
    'ลีน่าดูอ่อนโยนแต่แข็งแรงในเวลาเดียวกัน',
    'แววตาลีน่าในตอนนี้คือบอกทุกความรู้สึก',
    'ลีน่ายิ้มทีไรใจฟูทุกที',
  ],
  miu: [
    'หมิวสดใสมาก อยู่ตรงไหนตรงนั้นก็สว่างไปหมด',
    'สีหน้าของหมิวในฉากซึ้งทำเอาใจสลายเลย',
    'หมิวน่ารักมาก ดูแล้วยิ้มตามตลอด',
    'เสียงหัวเราะของหมิวคือเสียงที่ชอบที่สุด',
    'หมิวเล่นได้ทั้งฮาทั้งซึ้ง เก่งมากจริงๆ',
    'หมิววันนี้น่ารักเกินไปแล้ว ใจไม่ไหว',
    'แววตาของหมิวในฉากนั้นยังติดอยู่ในหัวเลย',
    'หมิวตั้งใจมากในทุกฉาก เห็นแล้วประทับใจ',
    'หมิวยิ้มทีไรใจละลายทุกที',
    'หมิวมีพลังบวกเยอะมาก ดูแล้วอารมณ์ดีตามไปด้วย',
    'หมิวสดใสเหมือนแสงแดดยามเช้าเลย',
    'หมิวเล่นฉากร้องไห้ได้ดีมาก ใจสลายตาม',
    'หมิวน่ารักทุกฉากจริงๆ ไม่มีพักเลย',
  ],
  series: [
    'Pls Love กลายเป็นช่วงเวลาที่รอคอยที่สุดของสัปดาห์ไปแล้ว',
    'ดูจบตอนแล้วอยากย้อนกลับไปดูใหม่ทันที',
    'รอตอนต่อไปไม่ไหวแล้ว นับวันรออยู่เลย',
    'ซีรีส์นี้ทำออกมาดีมาก และลีน่าหมิวก็ถ่ายทอดได้สวยงามมาก',
    'ตอนนี้ดีมากจริงๆ ยิ้มตั้งแต่ต้นจนจบเลย',
    'ทุกตอนผ่านไปเร็วมาก ดูไม่พอเลยจริงๆ',
    'ตอนจบทำเอานั่งนิ่งไปหลายนาทีเลย',
    'Pls Love ทำให้ทุกสัปดาห์มีอะไรให้รอคอย',
    'ดูแต่ละตอนแล้วอินมาก ลืมเวลาไปเลย',
    'Pls Love ตอนนี้ดีมาก ดูจบแล้วยังคิดถึง',
    'รอดู Pls Love ทุกสัปดาห์ไม่เคยพลาด',
    'ซีรีส์นี้ทำให้มีความสุขทุกสัปดาห์จริงๆ',
  ],
  support: [
    'ขอบคุณลีน่ากับหมิวที่ตั้งใจทำงานกันขนาดนี้',
    'จะเป็นกำลังใจให้ลีน่าหมิวไปตลอดเลย',
    'อยากให้ลีน่ากับหมิวรู้ว่ามีคนรักและเป็นกำลังใจให้เยอะมาก',
    'พักผ่อนเยอะๆ นะลีน่าหมิว ดูแลสุขภาพด้วย',
    'ไม่ว่าจะเกิดอะไรขึ้น จะอยู่ข้างๆ ลีน่าหมิวเสมอ',
    'ขอให้ลีน่ากับหมิวมีความสุขมากๆ และมีผลงานดีๆ ออกมาอีกเยอะๆ',
    'เหนื่อยแค่ไหนก็ขอให้รู้ว่ามีแฟนๆ อยู่ข้างๆ เสมอนะลีน่าหมิว',
    'ขอให้ลีน่าหมิวมีแต่เรื่องดีๆ เข้ามาในชีวิต',
    'ขอให้ลีน่าหมิวมีสุขภาพแข็งแรงและมีความสุขมากๆ',
    'แฟนๆ จะอยู่ตรงนี้เป็นกำลังใจให้เสมอนะ',
    'เห็นความตั้งใจของลีน่าหมิวแล้วอยากซัพพอร์ตให้สุดใจ',
  ],
  comfort: [
    'วันไหนเหนื่อยๆ แค่ได้ดูลีน่าหมิวก็หายเหนื่อยแล้ว',
    'ลีน่าหมิวคือความสบายใจของเราจริงๆ',
    'เห็นสองคนหัวเราะด้วยกันแล้วมีความสุขตามไปด้วย',
    'ดูคลิปลีน่าหมิวก่อนนอนคือกิจวัตรประจำวันไปแล้ว',
    'วันนี้แย่แค่ไหน แต่พอได้เห็นลีน่าหมิวก็ยิ้มได้',
    'เสียงหัวเราะของลีน่าหมิวช่วยให้หายเครียดได้ทุกครั้ง',
    'ลีน่าหมิวคือยาใจของเราจริงๆ',
    'ดูลีน่าหมิวแล้วความเครียดหายไปหมดเลย',
    'แค่เห็นลีน่าหมิวยิ้มก็มีแรงสู้ต่อแล้ว',
  ],
  growth: [
    'ความตั้งใจของลีน่าหมิวเห็นได้ชัดในทุกฉาก',
    'ภูมิใจในตัวลีน่าหมิวมากๆ เก่งขึ้นทุกวันเลย',
    'ดูลีน่าหมิวเติบโตขึ้นในทุกผลงานแล้วดีใจมาก',
    'ลีน่าหมิวพัฒนาขึ้นเยอะมาก ดูแล้วภูมิใจแทนจริงๆ',
    'ลีน่าหมิวเก่งขึ้นทุกตอน ภูมิใจแทนมากๆ',
    'ดูการเติบโตของลีน่าหมิวแล้วปลื้มใจสุดๆ',
  ],
  visuals: [
    'วันนี้ลีน่ากับหมิวสวยมาก ละสายตาไม่ได้เลย',
    'ลีน่าหมิวยืนคู่กันคือภาพที่สวยที่สุดของวันนี้',
    'ทุกรูปของลีน่าหมิวสวยเหมือนโปสเตอร์หนังเลย',
    'ลีน่าหมิววันนี้ออร่าเปล่งประกายมาก',
    'ลีน่าหมิววันนี้สวยออร่าพุ่งมาก',
    'ภาพลีน่าหมิวคู่กันคือสวยเกินบรรยาย',
  ],
  fandom: [
    'ดีใจที่ได้เป็นส่วนหนึ่งของแฟนคลับลีน่าหมิว',
    'แฟนคลับลีน่าหมิวน่ารักกันมาก อบอุ่นสุดๆ',
    'มาช่วยกันส่งต่อความรักให้ลีน่าหมิวกันเยอะๆ นะ',
    'ขอบคุณแฟนคลับทุกคนที่ช่วยกันซัพพอร์ตลีน่าหมิวนะ',
    'แฟนคลับลีน่าหมิวน่ารักและอบอุ่นที่สุด',
    'ดีใจที่ได้รู้จักเพื่อนๆ ในแฟนคลับลีน่าหมิว',
  ],
  rewatch: [
    'ดูฉากนั้นซ้ำไปเป็นสิบรอบแล้วก็ยังไม่เบื่อ',
    'ดูซ้ำทีไรก็เจอรายละเอียดใหม่ทุกที',
    'ตอนนี้ในเครื่องมีแต่รูปลีน่าหมิวเต็มไปหมด',
    'ดูซ้ำกี่รอบก็ยังเขินเหมือนเดิม',
    'ดูซ้ำกี่รอบก็ยังยิ้มตามทุกครั้ง',
    'วนดูฉากเดิมซ้ำไปมาไม่เบื่อเลย',
  ],
  feelings: [
    'ตกหลุมรักลีน่าหมิวซ้ำๆ ทุกตอนเลย',
    'ใจเต้นแรงทุกครั้งที่ลีน่าหมิวโผล่มาในจอ',
    'ยิ้มให้โทรศัพท์คนเดียวเพราะลีน่าหมิวอีกแล้ว',
    'บอกตัวเองว่าจะใจเย็น แต่พอเห็นลีน่าหมิวก็ไม่ไหวทุกที',
    'ยิ่งดูยิ่งรักลีน่าหมิวมากขึ้นเรื่อยๆ',
    'ไม่คิดว่าจะรักลีน่าหมิวได้มากขนาดนี้',
    'รักลีน่าหมิวมากขึ้นทุกวันจริงๆ',
    'ลีน่าหมิวคือความสุขที่สุดในแต่ละวัน',
  ],
};

const TH_STANDALONE = [
  'ดูลีน่าหมิวทีไรก็ยิ้มตามทุกที เคมีของสองคนนี้เป็นธรรมชาติมาก ฉากไหนก็ดูอบอุ่นไปหมด ขอบคุณที่ทำให้วันธรรมดากลายเป็นวันที่ดีนะ',
  'ทุกสัปดาห์รอดู Pls Love ด้วยใจจดจ่อ ลีน่ากับหมิวเล่นดีขึ้นทุกตอนเลย ภูมิใจในตัวสองคนนี้มากๆ จะเป็นกำลังใจให้ตลอดไป',
  'วันไหนเหนื่อยๆ แค่ได้ดูคลิปลีน่าหมิวก็หายเหนื่อยแล้ว สองคนนี้คือความสบายใจของเราจริงๆ ขอบคุณที่มีอยู่นะ',
  'ลีน่าอ่อนโยน หมิวสดใส พอมาอยู่ด้วยกันคือลงตัวที่สุด ดูกี่รอบก็ไม่เบื่อเลย ขอบคุณที่ทำให้ทุกสัปดาห์มีความสุขขนาดนี้ รักลีน่าหมิวมากๆ',
  'ขอบคุณลีน่ากับหมิวที่ตั้งใจทำงานกันขนาดนี้ ทุกฉากเห็นถึงความใส่ใจจริงๆ พักผ่อนเยอะๆ ด้วยนะ จะเป็นกำลังใจให้ตลอดไปเลย',
  'ฉากซึ้งตอนล่าสุดทำเอาน้ำตาไหลไม่หยุด ลีน่าหมิวถ่ายทอดอารมณ์ได้ดีมาก ไม่รู้จะชมยังไงแล้ว ภูมิใจในตัวสองคนนี้มากจริงๆ',
  'ดูซ้ำมาเป็นสิบรอบแล้วก็ยังเจอรายละเอียดใหม่ๆ ทุกครั้ง นี่แหละความตั้งใจของลีน่าหมิว ภูมิใจมากจริงๆ รอตอนต่อไปอยู่นะ',
  'เป็นแฟนคลับลีน่าหมิวแล้วมีความสุขมากจริงๆ ได้เจอเพื่อนใหม่ ได้ยิ้มทุกวัน ขอบคุณลีน่ากับหมิวที่ทำให้ทุกวันสดใสขึ้นนะ',
  'ทุกครั้งที่ได้ดูลีน่าหมิวก็รู้สึกเหมือนได้พักใจ เคมีของสองคนนี้เป็นธรรมชาติมาก ทุกฉากดูอบอุ่นและจริงใจ ขอบคุณที่ทำให้ทุกสัปดาห์มีความหมายนะ',
  'ลีน่ากับหมิวทำให้ Pls Love เป็นซีรีส์ที่พิเศษมากสำหรับเรา ดูซ้ำกี่รอบก็ยังอินเหมือนเดิม รอตอนต่อไปทุกสัปดาห์เลย',
  'อยากให้ลีน่าหมิวรู้ว่ามีคนรักและเป็นกำลังใจให้อยู่ทั่วโลก ไม่ว่าจะเหนื่อยแค่ไหนก็ขอให้รู้ว่าเราอยู่ตรงนี้เสมอนะ',
];

const EN_EMOJI = ['💗', '💖', '✨', '🫶', '🤍', '🥹', '🌟', '💫', '🔥'];
const TH_EMOJI = ['🌸', '💕', '🥰', '💗', '🤍', '✨', '🫶'];

const THEME_WEIGHTS = {
  chemistry: 3, acting: 2, lena: 2, miu: 2, series: 2, support: 2,
  comfort: 1.5, growth: 1, visuals: 1, fandom: 1, rewatch: 1, feelings: 1.5,
};

// ---------------------------------------------------------------- tien ich

function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(SEED);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const expand = (s) => s.replace(/\{([^{}]+)\}/g, (_, alts) => pick(alts.split('|')));

function pickWeighted(weights) {
  const entries = Object.entries(weights);
  let r = rand() * entries.reduce((s, [, w]) => s + w, 0);
  for (const [k, w] of entries) if ((r -= w) < 0) return k;
  return entries[0][0];
}

/**
 * Do dai theo cach X dem (bang trong so cua twitter-text): emoji tinh 2; chu
 * Latin, Thai va dau cau thong dung tinh 1; con lai (Han, Nhat, ca chu Viet
 * co dau dung san) tinh 2.
 */
const EMOJI_RE = /\p{Regional_Indicator}{2}|\p{Extended_Pictographic}(?:\p{Emoji_Modifier}|\uFE0F|\u200D\p{Extended_Pictographic})*/gu;
const light = (cp) => cp <= 0x10ff || (cp >= 0x2000 && cp <= 0x200d) ||
  (cp >= 0x2010 && cp <= 0x201f) || (cp >= 0x2032 && cp <= 0x2037);
function xlen(s) {
  let n = 0;
  for (const ch of s.normalize('NFC').replace(EMOJI_RE, () => { n += 2; return ''; })) {
    n += light(ch.codePointAt(0)) ? 1 : 2;
  }
  return n;
}

// Moi cau la mot o { text, uses }. Boc 3 o roi lay o dung it nhat de cac cau
// duoc rai deu, khong cau nao bi lap qua nhieu.
const toPool = (list) => list.map((text) => ({ text, uses: 0 }));
function pickFresh(pool, taken) {
  let best = null;
  for (let i = 0; i < 3; i++) {
    const e = pick(pool);
    if (taken.includes(e)) continue;
    if (!best || e.uses < best.uses) best = e;
  }
  return best;
}

const NAMED = /Lena|Miu|ลีน่า|หมิว/;
const PRONOUN = /\b(they|them|their|these two|both of them|you two)\b|สองคน/i;

/**
 * Cau chi noi "they/them" ma khong co ten thi phai dung sau mot cau da goi
 * ten, va ca bai phai co ten it nhat mot lan.
 */
function referencesOk(parts) {
  let named = false;
  for (const p of parts) {
    if (NAMED.test(p)) named = true;
    else if (PRONOUN.test(p) && !named) return false;
  }
  return named;
}

/** Hai cau cung mo dau bang hai tu giong nhau, hoac cung cam on, nghe lap. */
function soundsRepetitive(parts) {
  const heads = parts.map((p) => p.toLowerCase().split(/\s+/).slice(0, 2).join(' '));
  if (new Set(heads).size < heads.length) return true;
  return parts.filter((p) => /thank|ขอบคุณ/i.test(p)).length > 1;
}

// ------------------------------------------------------------------ ghep bai

function makeBuilder({ openers, closers, bodies, emoji, joiner, tails }) {
  const op = toPool(openers);
  const cl = toPool(closers);
  const themes = Object.fromEntries(Object.entries(bodies).map(([k, v]) => [k, toPool(v)]));
  const usedSets = new Set();

  function nextTheme(prev) {
    const r = rand();
    if (prev === 'lena' && r < 0.35) return 'miu';
    if (prev === 'miu' && r < 0.35) return 'lena';
    return r < 0.5 ? prev : pickWeighted(THEME_WEIGHTS);
  }

  return function build() {
    const texts = new Map();
    const textOf = (e) => {
      if (!texts.has(e)) texts.set(e, expand(e.text));
      return texts.get(e);
    };
    const compose = (cells) => cells.map(textOf).join(joiner);

    // Do dai muon dat, lech ve phia dai: can bac hai keo phan lon len nua tren
    const target = MIN_LEN + (MAX_LEN - MIN_LEN) * Math.sqrt(rand());
    const opener = rand() < 0.45 ? pickFresh(op, []) : null;
    const closer = rand() < 0.6 ? pickFresh(cl, []) : null;
    const frame = (body) => [opener, ...body, closer].filter(Boolean);

    // Them tung cau than bai cho toi khi du dai; cau nao lam vuot MAX_LEN thi
    // bo, boc cau khac
    const body = [];
    let theme = pickWeighted(THEME_WEIGHTS);
    for (let tries = 0; tries < 10 && xlen(compose(frame(body))) < target; tries++) {
      const b = pickFresh(themes[theme], body);
      if (!b || xlen(compose(frame([...body, b]))) > MAX_LEN) continue;
      body.push(b);
      theme = nextTheme(theme);
    }
    if (!body.length) return null;

    // Cau than dau tien phai goi ten, de cac cau "they" phia sau co chu ngu
    const firstNamed = body.findIndex((b) => NAMED.test(textOf(b)));
    if (firstNamed > 0) body.unshift(body.splice(firstNamed, 1)[0]);

    const cells = frame(body);
    const parts = cells.map(textOf);
    if (!referencesOk(parts) || soundsRepetitive(parts)) return null;

    const bodyKey = body.map((e) => e.text).sort().join('|');
    if (usedSets.has(bodyKey)) return null;

    let text = compose(cells);
    if (tails && rand() < 0.06) {
      const withTail = `${text}${joiner}${pick(tails)}`;
      if (xlen(withTail) <= MAX_LEN) text = withTail;
    }
    const r = rand();
    const nEmoji = r < 0.3 ? 0 : r < 0.8 ? 1 : 2;
    const tail = [];
    while (tail.length < nEmoji) {
      const e = pick(emoji);
      if (!tail.includes(e)) tail.push(e);
    }
    if (tail.length && xlen(`${text} ${tail.join('')}`) <= MAX_LEN) text += ` ${tail.join('')}`;

    const len = xlen(text);
    if (len < MIN_LEN || len > MAX_LEN) return null;

    usedSets.add(bodyKey);
    for (const cell of cells) cell.uses++;
    return text;
  };
}

const buildEn = makeBuilder({
  openers: EN_OPENERS, closers: EN_CLOSERS, bodies: EN_BODIES,
  emoji: EN_EMOJI, joiner: ' ', tails: EN_THAI_TAILS,
});
const buildTh = makeBuilder({
  openers: TH_OPENERS, closers: TH_CLOSERS, bodies: TH_BODIES,
  emoji: TH_EMOJI, joiner: ' ', tails: null,
});

// -------------------------------------------------------------------- chay

const seen = new Set();
const out = [];
const keyOf = (s) => s.replace(EMOJI_RE, '').trim().toLowerCase();
function add(s) {
  const k = keyOf(s);
  if (seen.has(k)) return false;
  seen.add(k);
  out.push(s);
  return true;
}

/** Bai viet tron ngan hon MIN_LEN thi noi them cau ket cho du dai. */
function pad(text, closers) {
  for (let i = 0; i < 8 && xlen(text) < MIN_LEN; i++) {
    const c = expand(pick(closers));
    if (xlen(`${text} ${c}`) <= MAX_LEN && !text.includes(c)) text = `${text} ${c}`;
  }
  return text;
}
for (const [list, closers] of [[EN_STANDALONE, EN_CLOSERS], [TH_STANDALONE, TH_CLOSERS]]) {
  for (const raw of list) {
    const s = pad(raw, closers);
    const len = xlen(s);
    if (len < MIN_LEN || len > MAX_LEN) throw new Error(`Bai viet tron dai ${len}: ${s}`);
    add(s);
  }
}

const thaiTarget = Math.round(COUNT * THAI_SHARE);
let thai = TH_STANDALONE.length;
let misses = 0;
while (out.length < COUNT) {
  const wantThai = thai < thaiTarget && rand() < THAI_SHARE * 1.5;
  const s = wantThai ? buildTh() : buildEn();
  if (s && add(s)) {
    if (wantThai) thai++;
    misses = 0;
  } else if (++misses > 20000) {
    throw new Error(`Het to hop sau ${out.length} cau — them cau vao kho hoac giam COUNT`);
  }
}

// Tron deu de cau Thai, cau viet tron khong don cuc o mot cho
for (let i = out.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1));
  [out[i], out[j]] = [out[j], out[i]];
}

// Giu dinh dang file cu: thut 2 dau cach, xuong dong CRLF, khong newline cuoi
const json = JSON.stringify({ contents: out }, null, 2).replace(/\n/g, '\r\n');
for (const f of OUTPUTS) fs.writeFileSync(f, json);

const lens = out.map(xlen).sort((a, b) => a - b);
const q = (p) => lens[Math.floor((lens.length - 1) * p)];
console.log(`${out.length} cau (Thai: ${thai}) -> ${OUTPUTS.join(', ')}`);
console.log(`Do dai theo X: min ${q(0)}, median ${q(0.5)}, p90 ${q(0.9)}, max ${q(1)}`);
