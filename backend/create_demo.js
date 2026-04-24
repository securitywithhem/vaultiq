const { Document, Packer, Paragraph, HeadingLevel } = require('docx');
const { PDFDocument, rgb } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

// ============================================================
// FILE 1: PURE HUMAN-WRITTEN (target: low AI score, verdict HUMAN)
// Style: varied sentence length, personal anecdotes, typos, contractions,
// uneven structure, specific names and places
// ============================================================
const humanContent = [
  "Remote Work: What Actually Happened",
  "",
  "Look, I'll be honest — when my boss first floated the remote work idea back in 2019, I laughed. Literally laughed, right in his face. Sorry, Tom.",
  "",
  "Our office on 7th Street was this chaotic, noisy, beautiful mess. Dogs under desks. That one weird printer that only worked on Tuesdays. Jenny's plants slowly dying in the break room because she kept 'forgetting' to water them (we all knew she hated those plants).",
  "",
  "Then March 2020 happened. You know the story. Suddenly we were all home, Zoom-ing each other with bad lighting and unflattering webcam angles. My cat walked across my keyboard during a client pitch. Twice.",
  "",
  "But here's the thing nobody warned me about — I got WAY more work done. Not some marginal improvement either. I mean, I finished a three-week project in nine days. Partly because nobody was stopping by my desk to ask about the weekend. Partly because I could finally concentrate.",
  "",
  "Not everyone had it easy though. Marcus, bless him, had two kids under five and no dedicated workspace. He took calls from his closet for six months. We all heard it when Ethan threw a tantrum about the wrong-colored juice box. Marcus still won employee of the year somehow.",
  "",
  "The weird part? When we eventually went back — hybrid, three days in office — it felt off. The office had changed. Half the plants were dead (thanks Jenny). The Tuesday printer was gone. People didn't really chit-chat anymore. It's like we forgot how.",
  "",
  "I think the honest truth is this: remote work broke something about how we worked together, AND fixed something about how we got things done. Both can be true. Anyone telling you it's all good or all bad is selling something.",
  "",
  "My take, two years in? I'd never go fully back. But I'd also never go fully remote. Two days a week with Tom and the team, three days with my cat — that's the sweet spot for me. Your mileage may vary, as the nerds say."
];

// ============================================================
// FILE 2: MIXED (target: mid AI score, verdict MIXED)
// Alternating human anecdote paragraphs with AI-style paragraphs
// ============================================================
const mixedContent = [
  "Machine Learning in Healthcare: Observations and Analysis",
  "",
  // AI-style paragraph
  "Machine learning represents a transformative paradigm in the healthcare industry, fundamentally reshaping diagnostic methodologies, treatment optimization frameworks, and patient outcome prediction systems. The integration of sophisticated algorithms into clinical workflows has enabled unprecedented capabilities across multiple domains of medical practice.",
  "",
  // Human-style paragraph
  "I sat in on Dr. Patel's demo last March at Mount Sinai. She showed us this radiology tool her team built — honestly? I was skeptical. I've seen a dozen 'revolutionary' medical AI pitches. But when she pulled up six mammograms and the model flagged the one her residents had missed, I got chills.",
  "",
  // AI-style paragraph
  "Furthermore, the deployment of machine learning solutions in healthcare environments necessitates rigorous validation processes, comprehensive regulatory compliance, and systematic evaluation against established clinical standards. Organizations implementing these technologies must navigate complex ethical considerations while optimizing operational efficiency.",
  "",
  // Human-style paragraph
  "What got me was Dr. Patel afterward, in the hallway, half-drinking bad conference coffee. She said the thing that mattered wasn't accuracy. 'It's that my nurses aren't burned out anymore,' she told me. 'They talk to patients. They're not staring at screens all shift.' That's the story nobody puts in the papers.",
  "",
  // AI-style paragraph
  "Moreover, the applications of machine learning extend across diverse clinical domains including disease prediction, personalized medicine, drug discovery acceleration, and treatment recommendation systems. These applications demonstrate significant potential for enhancing healthcare delivery while simultaneously addressing workforce efficiency challenges.",
  "",
  // Human-style paragraph
  "Of course, it's not all rosy. Her hospital spent $2.1M on implementation. Training took eight months. Two senior radiologists quit during the rollout because they felt 'replaced' (they weren't — they misread the memo, it was rough). You don't hear about that stuff at conferences.",
  "",
  // AI-style paragraph
  "In conclusion, while machine learning presents substantial opportunities for healthcare transformation, successful implementation requires careful consideration of technical, ethical, and human factors. The path forward involves balanced integration that leverages technological capabilities while preserving the fundamental human elements of patient care.",
  "",
  // Human-style paragraph
  "Anyway — I left the conference thinking Dr. Patel's team got it right, and most of the vendors in the exhibit hall have absolutely no idea what they're doing. Buy her team's product. Skip the rest. That's my hot take."
];

// ============================================================
// FILE 3: PURE AI-GENERATED (target: high AI score, verdict AI)
// Strong LLM fingerprints:
//  - Heavy transitions (Furthermore, Moreover, Additionally)
//  - Hedging ("It is important to note", "it is worth considering")
//  - Triple structures ("X, Y, and Z")
//  - Uniform sentence length (low burstiness)
//  - Formal vocabulary
//  - Generic examples, no specifics
//  - "In conclusion" paragraph
//  - Parallel structure lists
//  - "delve", "leverage", "tapestry", "navigate", "realm", "landscape"
// ============================================================
const aiContent = [
  "The Transformative Impact of Artificial Intelligence on Contemporary Industry",
  "",
  "Introduction",
  "",
  "In today's rapidly evolving technological landscape, artificial intelligence has emerged as a transformative force, fundamentally reshaping the contours of contemporary industry across diverse sectors and geographic regions. It is important to note that the implementation of artificial intelligence systems represents not merely an incremental improvement, but rather a paradigm shift that is revolutionizing how organizations operate, strategize, and compete in increasingly globalized markets.",
  "",
  "As we delve into the multifaceted realm of artificial intelligence, it becomes evident that these sophisticated technologies are fundamentally altering business methodologies, operational frameworks, and strategic decision-making processes. Furthermore, the integration of machine learning algorithms, deep neural networks, and advanced analytics platforms has facilitated unprecedented opportunities for innovation, efficiency optimization, and value creation across numerous industry verticals.",
  "",
  "Economic Implications and Market Dynamics",
  "",
  "The economic implications of artificial intelligence adoption are profound, far-reaching, and multidimensional in nature. Moreover, comprehensive analyses conducted by leading research institutions indicate that organizations leveraging artificial intelligence technologies consistently demonstrate superior performance metrics, enhanced operational efficiency, and improved competitive positioning relative to their non-AI-enabled counterparts.",
  "",
  "Additionally, it is worth considering that the global artificial intelligence market is projected to experience substantial growth, with conservative estimates suggesting a compound annual growth rate exceeding 35% through the coming decade. This remarkable expansion is driven by three key factors: increasing computational capabilities, expanding data availability, and growing organizational recognition of artificial intelligence's strategic importance.",
  "",
  "Furthermore, the transformative potential of artificial intelligence extends beyond mere financial metrics, encompassing broader societal implications, workforce transformation dynamics, and fundamental changes in how value is created, captured, and distributed throughout the global economy. Organizations that successfully navigate this complex landscape position themselves to capitalize on emerging opportunities while mitigating associated risks.",
  "",
  "Sectoral Applications and Implementation Considerations",
  "",
  "In the realm of healthcare, artificial intelligence facilitates enhanced diagnostic accuracy, personalized treatment protocols, and optimized resource allocation strategies. Similarly, within the financial services sector, machine learning algorithms enable sophisticated fraud detection capabilities, algorithmic trading systems, and comprehensive risk assessment frameworks that fundamentally transform traditional banking operations.",
  "",
  "Moreover, the manufacturing industry has witnessed substantial transformation through the deployment of artificial intelligence-driven predictive maintenance systems, quality control mechanisms, and supply chain optimization platforms. It is important to recognize that these implementations have consistently demonstrated the capacity to reduce operational costs, enhance productivity metrics, and improve overall organizational effectiveness.",
  "",
  "Additionally, the retail sector has experienced significant transformation through personalized recommendation engines, inventory optimization systems, and customer behavior analytics platforms. Furthermore, telecommunications companies are increasingly leveraging artificial intelligence to enhance network performance, optimize resource allocation, and deliver superior customer experiences across diverse touchpoints.",
  "",
  "Challenges and Strategic Considerations",
  "",
  "Despite the transformative potential of artificial intelligence, organizations must navigate numerous challenges, including data privacy considerations, regulatory compliance requirements, and ethical implementation frameworks. It is essential to acknowledge that successful artificial intelligence deployment requires careful consideration of technical, operational, and organizational factors.",
  "",
  "Furthermore, the global talent shortage for artificial intelligence specialists represents a significant obstacle to widespread adoption. Organizations must invest strategically in comprehensive training programs, cultivate internal expertise, and establish partnerships with academic institutions to address this critical capacity gap. Moreover, ongoing educational initiatives are essential for ensuring workforce readiness in an increasingly AI-driven economy.",
  "",
  "Conclusion",
  "",
  "In conclusion, artificial intelligence represents a transformative force that is fundamentally reshaping the contemporary business landscape. Organizations that successfully implement these technologies position themselves to achieve sustainable competitive advantage, operational excellence, and long-term value creation. As we continue to navigate this evolving technological frontier, it is essential to maintain a balanced approach that leverages artificial intelligence capabilities while addressing associated challenges and ethical considerations.",
  "",
  "Ultimately, the integration of artificial intelligence into contemporary industry is not merely a technological imperative, but rather a strategic necessity for organizations seeking to thrive in an increasingly complex and competitive global environment. By embracing these transformative technologies thoughtfully and systematically, organizations can unlock unprecedented opportunities for growth, innovation, and sustainable success."
];

function createDocxDocument(content) {
  const paragraphs = content.map((text) => {
    if (text === "") return new Paragraph({ text: "" });
    return new Paragraph({ text, spacing: { line: 360, after: 200 } });
  });
  return new Document({ sections: [{ children: paragraphs }] });
}

async function createPdfDocument(title, content) {
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([595, 842]);
  const { height } = page.getSize();
  let yPosition = height - 50;
  const lineHeight = 14;
  const pageMargin = 40;

  page.drawText(title, { x: pageMargin, y: yPosition, size: 16, color: rgb(0, 0, 0) });
  yPosition -= 30;

  content.forEach((text) => {
    if (text === "") { yPosition -= lineHeight; return; }
    const words = text.split(' ');
    let line = '';
    for (let word of words) {
      if ((line + word).length > 90) {
        if (yPosition < pageMargin + 20) {
          page = pdfDoc.addPage([595, 842]);
          yPosition = height - 50;
        }
        page.drawText(line, { x: pageMargin, y: yPosition, size: 10, color: rgb(0, 0, 0) });
        yPosition -= lineHeight;
        line = word + ' ';
      } else {
        line += word + ' ';
      }
    }
    if (line) {
      if (yPosition < pageMargin + 20) {
        page = pdfDoc.addPage([595, 842]);
        yPosition = height - 50;
      }
      page.drawText(line, { x: pageMargin, y: yPosition, size: 10, color: rgb(0, 0, 0) });
      yPosition -= lineHeight;
    }
    yPosition -= 4;
  });

  return pdfDoc;
}

async function generateFiles() {
  try {
    const docDir = '../demo_files';
    if (!fs.existsSync(docDir)) fs.mkdirSync(docDir, { recursive: true });

    const humanDoc = createDocxDocument(humanContent);
    const mixedDoc = createDocxDocument(mixedContent);
    const aiDoc = createDocxDocument(aiContent);

    const [humanBuffer, mixedBuffer, aiBuffer] = await Promise.all([
      Packer.toBuffer(humanDoc),
      Packer.toBuffer(mixedDoc),
      Packer.toBuffer(aiDoc)
    ]);

    fs.writeFileSync(path.join(docDir, '1_Human_Written.docx'), humanBuffer);
    fs.writeFileSync(path.join(docDir, '2_Mixed_Content.docx'), mixedBuffer);
    fs.writeFileSync(path.join(docDir, '3_AI_Generated.docx'), aiBuffer);

    const humanPdf = await createPdfDocument("Remote Work: What Actually Happened", humanContent);
    const mixedPdf = await createPdfDocument("Machine Learning in Healthcare: Observations and Analysis", mixedContent);
    const aiPdf = await createPdfDocument("The Transformative Impact of Artificial Intelligence", aiContent);

    fs.writeFileSync(path.join(docDir, '1_Human_Written.pdf'), await humanPdf.save());
    fs.writeFileSync(path.join(docDir, '2_Mixed_Content.pdf'), await mixedPdf.save());
    fs.writeFileSync(path.join(docDir, '3_AI_Generated.pdf'), await aiPdf.save());

    console.log('✓ Regenerated all 6 demo files with stronger signatures');
    
    // Print stats
    const countWords = (arr) => arr.join(' ').split(/\s+/).filter(Boolean).length;
    console.log(`\nWord counts:`);
    console.log(`  Human:  ${countWords(humanContent)} words`);
    console.log(`  Mixed:  ${countWords(mixedContent)} words`);
    console.log(`  AI:     ${countWords(aiContent)} words`);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

generateFiles();
