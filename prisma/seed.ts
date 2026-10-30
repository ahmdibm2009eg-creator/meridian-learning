/**
 * Demo dataset — 100% original content authored for this platform.
 * Demo credentials are DEVELOPMENT ONLY and must never ship to production.
 *
 * Run: bun prisma/seed.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
import { scryptSync, randomBytes } from "crypto";
function hash(pw: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(pw, salt, 64).toString("hex")}`;
}
const DEMO_PASSWORD = "Demo1234!";

// Deterministic RNG so reseeds are reproducible
let seedState = 42;
function rnd() {
  seedState = (seedState * 1103515245 + 12345) % 2147483648;
  return seedState / 2147483648;
}
function pick<T>(arr: T[]): T { return arr[Math.floor(rnd() * arr.length)]; }

async function main() {
  console.log("Seeding Meridian demo dataset…");

  // ── Organizations ──────────────────────────────────────────
  const northfield = await db.organization.upsert({
    where: { slug: "northfield" },
    update: {},
    create: { name: "Northfield Academy", slug: "northfield", brandingColor: "#0f766e" },
  });
  const cedar = await db.organization.upsert({
    where: { slug: "cedar" },
    update: {},
    create: { name: "Cedar Institute", slug: "cedar", brandingColor: "#9a3412" },
  });

  // ── Users ───────────────────────────────────────────────────
  const mkUser = (email: string, name: string, role: string, orgId: string, locale = "en") =>
    db.user.upsert({
      where: { email },
      update: {},
      create: { email, name, role, organizationId: orgId, locale, passwordHash: hash(DEMO_PASSWORD) },
    });

  const admin = await mkUser("admin@northfield.edu", "Priya Natarajan", "ORG_ADMIN", northfield.id);
  const teacher = await mkUser("teacher@northfield.edu", "Sarah Okafor", "TEACHER", northfield.id);
  const teacher2 = await mkUser("david@northfield.edu", "David Kim", "TEACHER", northfield.id);
  const maya = await mkUser("student@northfield.edu", "Maya Haddad", "STUDENT", northfield.id);
  const alex = await mkUser("alex@northfield.edu", "Alex Chen", "STUDENT", northfield.id);
  const omar = await mkUser("omar@northfield.edu", "Omar Farouk", "STUDENT", northfield.id, "en");
  await mkUser("parent@northfield.edu", "Laila Haddad", "PARENT", northfield.id);
  await mkUser("admin@cedar.edu", "Cedar Admin", "ORG_ADMIN", cedar.id);
  await mkUser("student@cedar.edu", "Noor Hassan", "STUDENT", cedar.id, "ar");

  // ── Taxonomy: SAT program ───────────────────────────────────
  const prog = await db.taxonomyNode.create({ data: { organizationId: northfield.id, name: "SAT Preparation", level: "PROGRAM", description: "Full SAT preparation track", position: 0 } });

  async function subject(name: string, pos: number, domains: [string, string[]][]) {
    const s = await db.taxonomyNode.create({ data: { organizationId: northfield.id, parentId: prog.id, name, level: "SUBJECT", position: pos } });
    const skillIds: { domain: string; skills: Record<string, string> }[] = [];
    for (const [domainName, skills] of domains) {
      const d = await db.taxonomyNode.create({ data: { organizationId: northfield.id, parentId: s.id, name: domainName, level: "DOMAIN" } });
      const map: Record<string, string> = {};
      for (const skill of skills) {
        const node = await db.taxonomyNode.create({ data: { organizationId: northfield.id, parentId: d.id, name: skill, level: "SKILL" } });
        map[skill] = node.id;
      }
      skillIds.push({ domain: domainName, skills: map });
    }
    return { subjectId: s.id, domains: skillIds };
  }

  const rw = await subject("SAT Reading & Writing", 0, [
    ["Information and Ideas", ["Central ideas and themes", "Command of evidence"]],
    ["Craft and Structure", ["Words in context", "Text structure and purpose"]],
    ["Expression of Ideas", ["Transitions and cohesion", "Rhetorical synthesis"]],
    ["Standard English Conventions", ["Agreement and pronouns", "Punctuation"]],
  ]);
  const math = await subject("SAT Mathematics", 1, [
    ["Algebra", ["Linear equations", "Systems of equations", "Quadratics and polynomials"]],
    ["Advanced Math", ["Exponent rules", "Radicals and rational exponents", "Function notation"]],
    ["Problem Solving and Data Analysis", ["Ratios and percentages", "Statistics and spread"]],
    ["Geometry and Trigonometry", ["Triangles and similarity", "Circles", "Right-triangle trigonometry"]],
  ]);
  const study = await subject("Learning Skills", 2, [
    ["Evidence-based learning", ["Spaced repetition", "Retrieval practice", "Error analysis"]],
  ]);

  const S = (...path: string[]): string | null => {
    let list: { domain: string; skills: Record<string, string> }[] = rw.domains;
    if (path[0] === "Math") list = math.domains;
    if (path[0] === "Study") list = study.domains;
    const dom = list.find((d) => d.domain === path[1]);
    return dom?.skills[path[2]] ?? null;
  };

  // ── Passages (original) ─────────────────────────────────────
  const passageOctopus = await db.passage.create({ data: {
    organizationId: northfield.id, title: "Distributed Minds", source: "Meridian Originals (science essay)",
    text: `Two-thirds of an octopus's neurons do not live in its brain; they live in its arms. Each arm gathers information, taste-tests its world, and can solve simple problems even after being separated from the body. For a long time, researchers described this arrangement as a curiosity — an exotic exception to the rule that thinking happens in a central brain. More recent work suggests something more interesting: the octopus does not merely have a different brain, it has a different kind of body plan for making decisions.\n\nConsider how an octopus hunts in a crack in a reef. The central brain issues a rough instruction — go there, investigate — but the details of reaching, feeling, and gripping are negotiated locally by each arm. Biologists call this delegation. The animal experiences the outcome without micromanaging the movement. In engineering terms, the octopus distributes processing to the edge of its body rather than routing every signal through headquarters.\n\nThis arrangement carries a cost. A distributed nervous system is harder to coordinate precisely, which may be one reason octopuses rarely build the structured, repeatable artefacts that centralised builders, like corals or bees, produce. What it buys instead is flexibility: an animal that can reconfigure itself around obstacles, reallocate its senses, and improvise in an unpredictable world.`,
  }});
  const passageKitchen = await db.passage.create({ data: {
    organizationId: northfield.id, title: "The Second Whistle", source: "Meridian Originals (literary sketch)",
    text: `The kettle whistled twice before my grandmother acknowledged it — once for the water, once, she insisted, for her. She would lift the kettle with a dish towel folded exactly in half, the way a nurse supports a wrist, and pour without looking at the cup. Her attention was on the window, where the courtyard pigeons rearranged themselves around a crust of bread.\n\nI was twelve and had come to tell her something urgent, though I can no longer remember what. Urgency had a different currency in that kitchen. The table had been scrubbed to the colour of driftwood; on it sat a jar of cardamom pods she refused to buy ground, because ground cardamom, she said, had already told its story.\n\nWhen I finally spoke, she did not answer at once. She turned the flame down, set the kettle on the cold burner, and gave me the whole of her attention — which I understood, even then, was the kitchen's true purpose. The tea could wait. The pigeons could wait. What I had brought through the door could not.`,
  }});

  // ── Question bank ───────────────────────────────────────────
  type Q = {
    type: string; stem: string; content: unknown; key: unknown; explanation: string;
    difficulty: number; est: number; taxonomy: string | null; passage?: string | null;
    strategies?: Record<string, string>; misconceptions?: string[]; tags?: string[]; points?: number;
    reviewStatus?: string;
  };

  const questions: Q[] = [
    // ── Algebra ──
    { type: "MCQ_SINGLE", stem: "If 3x + 7 = 22, what is the value of x?",
      content: { options: [{ id: "a", text: "3" }, { id: "b", text: "4" }, { id: "c", text: "5" }, { id: "d", text: "15" }] },
      key: { correct: ["c"] }, explanation: "Subtract 7 from both sides to get 3x = 15, then divide by 3 to get x = 5.",
      difficulty: 2, est: 45, taxonomy: S("Math", "Algebra", "Linear equations"),
      strategies: { fastest: "Solve mentally: 22 − 7 = 15, and 15 ÷ 3 = 5.", standard: "Subtract 7, divide by 3.", beginner: "Replace x with each option and test which makes both sides equal." },
      misconceptions: ["Choosing 15 by forgetting to divide by 3."] },
    { type: "MCQ_SINGLE", stem: "If f(x) = 2x² − 3x + 1, what is f(−2)?",
      content: { options: [{ id: "a", text: "7" }, { id: "b", text: "11" }, { id: "c", text: "15" }, { id: "d", text: "19" }] },
      key: { correct: ["c"] }, explanation: "2(4) − 3(−2) + 1 = 8 + 6 + 1 = 15. Watch the double negative on −3x.",
      difficulty: 3, est: 75, taxonomy: S("Math", "Algebra", "Quadratics and polynomials"),
      misconceptions: ["Forgetting that (−2)² = +4, not −4.", "Dropping the +1."] },
    { type: "NUMERIC", stem: "Solve for x: 5x − 12 = 3x + 20",
      content: {}, key: { value: 16, tolerance: 0 },
      explanation: "Subtract 3x: 2x − 12 = 20. Add 12: 2x = 32. Divide by 2: x = 16.",
      difficulty: 3, est: 60, taxonomy: S("Math", "Algebra", "Linear equations") },
    { type: "MCQ_SINGLE", stem: "Which expression is equivalent to (x + 3)² − (x − 3)²?",
      content: { options: [{ id: "a", text: "6x" }, { id: "b", text: "12x" }, { id: "c", text: "2x² + 18" }, { id: "d", text: "x² + 18" }] },
      key: { correct: ["b"] }, explanation: "Expand: (x²+6x+9) − (x²−6x+9) = 12x. Or use A²−B² = (A+B)(A−B) = (2x)(6) = 12x.",
      difficulty: 4, est: 90, taxonomy: S("Math", "Algebra", "Quadratics and polynomials"),
      strategies: { fastest: "Difference of squares: (A−B)(A+B) with A=x+3, B=x−3 gives (6)(2x) = 12x — no expansion needed.", standard: "Expand both squares and simplify." } },
    { type: "MCQ_SINGLE", stem: "A line passes through the point (2, 3) and has slope 4. What is its y-intercept?",
      content: { options: [{ id: "a", text: "−5" }, { id: "b", text: "−11" }, { id: "c", text: "5" }, { id: "d", text: "11" }] },
      key: { correct: ["a"] }, explanation: "3 = 4(2) + b → 3 = 8 + b → b = −5.",
      difficulty: 3, est: 75, taxonomy: S("Math", "Algebra", "Linear equations"),
      misconceptions: ["Subtracting incorrectly and choosing −11."] },
    { type: "NUMERIC", stem: "The system y = 3x − 1 and y = x + 5 intersects at (x, y). What is x?",
      content: {}, key: { value: 3, tolerance: 0 },
      explanation: "Set equal: 3x − 1 = x + 5 → 2x = 6 → x = 3.",
      difficulty: 4, est: 80, taxonomy: S("Math", "Algebra", "Systems of equations") },
    { type: "MCQ_MULTI", stem: "Select all values that satisfy |x − 2| < 5.",
      content: { options: [{ id: "a", text: "−4" }, { id: "b", text: "−2" }, { id: "c", text: "3" }, { id: "d", text: "7" }, { id: "e", text: "8" }] },
      key: { correct: ["b", "c"] }, explanation: "|x−2| < 5 means −5 < x−2 < 5, so −3 < x < 7. Only −2 and 3 are strictly inside; 7 is excluded because the inequality is strict.",
      difficulty: 3, est: 90, taxonomy: S("Math", "Algebra", "Linear equations"),
      misconceptions: ["Including 7 — the inequality is strict, so the boundary fails."] },
    { type: "SHORT_ANSWER", stem: "What is the slope of the line y = 7x − 12?",
      content: {}, key: { accepted: ["7"] },
      explanation: "In slope-intercept form y = mx + b, the coefficient of x is the slope: 7.",
      difficulty: 2, est: 30, taxonomy: S("Math", "Algebra", "Linear equations") },
    { type: "FILL_BLANK", stem: "Expand: (x + 4)(x − 6) = x² + {{1}}x − 24. Fill in the missing coefficient.",
      content: { blanks: [{ id: "1" }] },
      key: { accepted: { "1": ["-2", "−2"] } },
      explanation: "(x+4)(x−6) = x² − 6x + 4x − 24 = x² − 2x − 24, so the coefficient is −2.",
      difficulty: 3, est: 60, taxonomy: S("Math", "Algebra", "Quadratics and polynomials") },
    { type: "MCQ_SINGLE", stem: "If x² = 4x + 12 and x < 0, what is x?",
      content: { options: [{ id: "a", text: "−6" }, { id: "b", text: "−2" }, { id: "c", text: "2" }, { id: "d", text: "6" }] },
      key: { correct: ["b"] }, explanation: "x² − 4x − 12 = 0 factors as (x − 6)(x + 2) = 0, so x = 6 or x = −2. Because x < 0, x = −2.",
      difficulty: 5, est: 100, taxonomy: S("Math", "Algebra", "Quadratics and polynomials"),
      misconceptions: ["Forgetting the constraint x < 0 and choosing 6."] },
    { type: "ORDERING", stem: "Order the steps to solve 2(x + 5) + 3 = 15.",
      content: { instruction: "Arrange from first to last.", items: [
        { id: "a", text: "Distribute 2 over (x + 5)" }, { id: "b", text: "Combine like terms on the left side" },
        { id: "c", text: "Subtract 13 from both sides" }, { id: "d", text: "Divide both sides by 2" }] },
      key: { correctOrder: ["a", "b", "c", "d"] },
      explanation: "2x + 10 + 3 = 15 → 2x + 13 = 15 → 2x = 2 → x = 1.",
      difficulty: 3, est: 80, taxonomy: S("Math", "Algebra", "Linear equations") },
    { type: "TRUE_FALSE", stem: "The graph of y = (x − 3)² + 2 has its vertex at (3, 2).",
      content: {}, key: { correct: true },
      explanation: "Vertex form y = a(x − h)² + k gives vertex (h, k) = (3, 2).",
      difficulty: 2, est: 40, taxonomy: S("Math", "Algebra", "Quadratics and polynomials") },
    { type: "TRUE_FALSE", stem: "Every linear equation in one variable has exactly one solution.",
      content: {}, key: { correct: false },
      explanation: "Counterexamples: x + 1 = x has no solution; 2x = 2x is true for every x.",
      difficulty: 2, est: 45, taxonomy: S("Math", "Algebra", "Linear equations") },

    // ── Advanced Math ──
    { type: "MCQ_SINGLE", stem: "Which of the following is equivalent to (2x³)²?",
      content: { options: [{ id: "a", text: "4x⁶" }, { id: "b", text: "2x⁶" }, { id: "c", text: "4x⁵" }, { id: "d", text: "8x⁶" }] },
      key: { correct: ["a"] }, explanation: "Square the coefficient (2² = 4) and multiply exponents (3 × 2 = 6).",
      difficulty: 3, est: 50, taxonomy: S("Math", "Advanced Math", "Exponent rules"),
      misconceptions: ["Adding exponents instead of multiplying them (choosing 4x⁵)."] },
    { type: "NUMERIC", stem: "If f(x) = √(3x + 4) and f(a) = 10, what is the value of a?",
      content: {}, key: { value: 32, tolerance: 0 },
      explanation: "√(3a + 4) = 10 → 3a + 4 = 100 → 3a = 96 → a = 32.",
      difficulty: 4, est: 80, taxonomy: S("Math", "Advanced Math", "Radicals and rational exponents") },
    { type: "MCQ_SINGLE", stem: "The function g(x) = x² + kx + 9 has exactly one real zero. What is the positive value of k?",
      content: { options: [{ id: "a", text: "3" }, { id: "b", text: "6" }, { id: "c", text: "9" }, { id: "d", text: "12" }] },
      key: { correct: ["b"] }, explanation: "One real zero means the discriminant is zero: k² − 4(1)(9) = 0 → k² = 36 → k = ±6; the positive value is 6.",
      difficulty: 4, est: 100, taxonomy: S("Math", "Advanced Math", "Function notation") },
    { type: "SHORT_ANSWER", stem: "The fraction 1/√2 can be written as √a ⁄ b. What is the value of a?",
      content: {}, key: { accepted: ["2"] },
      explanation: "Multiply numerator and denominator by √2: 1/√2 = √2/2, so a = 2.",
      difficulty: 3, est: 60, taxonomy: S("Math", "Advanced Math", "Radicals and rational exponents") },
    { type: "NUMERIC", stem: "If 3ᵃ = 81, what is a?",
      content: {}, key: { value: 4, tolerance: 0 },
      explanation: "81 = 3⁴, so a = 4.",
      difficulty: 2, est: 40, taxonomy: S("Math", "Advanced Math", "Exponent rules") },

    // ── Data analysis ──
    { type: "MCQ_SINGLE", stem: "In a class of 24 students, 25% walk to school. How many students walk?",
      content: { options: [{ id: "a", text: "4" }, { id: "b", text: "6" }, { id: "c", text: "8" }, { id: "d", text: "12" }] },
      key: { correct: ["b"] }, explanation: "0.25 × 24 = 6.",
      difficulty: 2, est: 35, taxonomy: S("Math", "Problem Solving and Data Analysis", "Ratios and percentages") },
    { type: "MCQ_SINGLE", stem: "The mean of 4, 8, x, and 12 is 9. What is x?",
      content: { options: [{ id: "a", text: "8" }, { id: "b", text: "10" }, { id: "c", text: "12" }, { id: "d", text: "14" }] },
      key: { correct: ["c"] }, explanation: "The mean equation is (4 + 8 + x + 12)/4 = 9 → 24 + x = 36 → x = 12.",
      difficulty: 3, est: 70, taxonomy: S("Math", "Problem Solving and Data Analysis", "Statistics and spread") },
    { type: "MCQ_SINGLE", stem: "A survey found 40% prefer tea, 35% prefer coffee, and 25% prefer juice. If 90 people prefer juice, how many people were surveyed?",
      content: { options: [{ id: "a", text: "225" }, { id: "b", text: "250" }, { id: "c", text: "300" }, { id: "d", text: "360" }] },
      key: { correct: ["d"] }, explanation: "0.25n = 90 → n = 360.",
      difficulty: 3, est: 75, taxonomy: S("Math", "Problem Solving and Data Analysis", "Ratios and percentages") },
    { type: "NUMERIC", stem: "A shirt priced at $40 is discounted by 25%. What is the sale price, in dollars?",
      content: { unit: "dollars" }, key: { value: 30, tolerance: 0.01 },
      explanation: "The discount is $10, so the sale price is $40 − $10 = $30.",
      difficulty: 3, est: 60, taxonomy: S("Math", "Problem Solving and Data Analysis", "Ratios and percentages") },
    { type: "MCQ_SINGLE", stem: "A scatterplot shows a strong negative linear relationship between hours of screen time and sleep quality. Which value best estimates the correlation coefficient?",
      content: { options: [{ id: "a", text: "−0.9" }, { id: "b", text: "−0.2" }, { id: "c", text: "0.4" }, { id: "d", text: "0.9" }] },
      key: { correct: ["a"] }, explanation: "Strong negative linear relationship → a correlation close to −1, so −0.9 fits best.",
      difficulty: 4, est: 80, taxonomy: S("Math", "Problem Solving and Data Analysis", "Statistics and spread") },
    { type: "TRUE_FALSE", stem: "Adding 5 to every value in a data set also increases the standard deviation by 5.",
      content: {}, key: { correct: false },
      explanation: "Shifting all values by a constant changes the mean but not the spread, so the standard deviation is unchanged.",
      difficulty: 3, est: 60, taxonomy: S("Math", "Problem Solving and Data Analysis", "Statistics and spread") },
    { type: "FILL_BLANK", stem: "In a proportional relationship y = kx, the constant k is called the {{1}} of variation, and the graph always passes through the {{2}}.",
      content: { blanks: [{ id: "1" }, { id: "2" }] },
      key: { accepted: { "1": ["constant", "constant of variation", "rate"], "2": ["origin", "the origin", "(0,0)", "(0, 0)"] } },
      explanation: "k is the constant of variation, and proportional graphs pass through the origin.",
      difficulty: 3, est: 70, taxonomy: S("Math", "Problem Solving and Data Analysis", "Ratios and percentages") },
    { type: "TRUE_FALSE", stem: "The median of a data set is always one of the values in the set.",
      content: {}, key: { correct: false },
      explanation: "With an even number of values, the median is the average of the two middle values and need not appear in the set.",
      difficulty: 3, est: 50, taxonomy: S("Math", "Problem Solving and Data Analysis", "Statistics and spread") },
    { type: "NUMERIC", stem: "The sum of three consecutive even integers is 66. What is the smallest of the three?",
      content: {}, key: { value: 20, tolerance: 0 },
      explanation: "n + (n+2) + (n+4) = 66 → 3n + 6 = 66 → n = 20 (so 20, 22, 24).",
      difficulty: 4, est: 90, taxonomy: S("Math", "Problem Solving and Data Analysis", "Ratios and percentages") },
    { type: "NUMERIC", stem: "What is 15% of 240?",
      content: {}, key: { value: 36, tolerance: 0.01 },
      explanation: "0.15 × 240 = 36.",
      difficulty: 2, est: 30, taxonomy: S("Math", "Problem Solving and Data Analysis", "Ratios and percentages") },
    { type: "MCQ_MULTI", stem: "Select all numbers that are rational.",
      content: { options: [{ id: "a", text: "√2" }, { id: "b", text: "0.333…" }, { id: "c", text: "π" }, { id: "d", text: "7⁄8" }, { id: "e", text: "√16" }] },
      key: { correct: ["b", "d", "e"] },
      explanation: "0.333… = 1/3, 7/8 is a ratio of integers, and √16 = 4. √2 and π are irrational.",
      difficulty: 4, est: 80, taxonomy: S("Math", "Advanced Math", "Radicals and rational exponents") },

    // ── Geometry & trig ──
    { type: "MCQ_SINGLE", stem: "A triangle has two angles measuring 40° and 65°. What is the measure of the third angle?",
      content: { options: [{ id: "a", text: "65°" }, { id: "b", text: "70°" }, { id: "c", text: "75°" }, { id: "d", text: "80°" }] },
      key: { correct: ["c"] }, explanation: "Angles in a triangle sum to 180°: 180 − 40 − 65 = 75°.",
      difficulty: 3, est: 45, taxonomy: S("Math", "Geometry and Trigonometry", "Triangles and similarity") },
    { type: "MCQ_SINGLE", stem: "A circle has area 49π. What is its circumference?",
      content: { options: [{ id: "a", text: "7π" }, { id: "b", text: "14π" }, { id: "c", text: "21π" }, { id: "d", text: "49π" }] },
      key: { correct: ["b"] }, explanation: "πr² = 49π → r = 7, so circumference = 2πr = 14π.",
      difficulty: 4, est: 80, taxonomy: S("Math", "Geometry and Trigonometry", "Circles"),
      strategies: { fastest: "Recognize 49 = 7², so r = 7 instantly; circumference follows." } },
    { type: "NUMERIC", stem: "A right triangle has legs of length 6 and 8. What is the length of the hypotenuse?",
      content: {}, key: { value: 10, tolerance: 0.01 },
      explanation: "6² + 8² = 36 + 64 = 100, so the hypotenuse is √100 = 10 (a classic 3-4-5 triple doubled).",
      difficulty: 3, est: 50, taxonomy: S("Math", "Geometry and Trigonometry", "Right-triangle trigonometry"),
      strategies: { shortcut: "6-8-10 is the 3-4-5 Pythagorean triple scaled by 2 — no computation needed." } },
    { type: "MCQ_SINGLE", stem: "If sin(θ) = 3/5 and θ is acute, what is cos(θ)?",
      content: { options: [{ id: "a", text: "3/5" }, { id: "b", text: "4/5" }, { id: "c", text: "5/3" }, { id: "d", text: "5/4" }] },
      key: { correct: ["b"] }, explanation: "Use sin²θ + cos²θ = 1: (3/5)² + cos²θ = 1 → cos²θ = 16/25 → cosθ = 4/5 (positive for acute θ). This is the 3-4-5 right triangle.",
      difficulty: 4, est: 85, taxonomy: S("Math", "Geometry and Trigonometry", "Right-triangle trigonometry") },
    { type: "MCQ_SINGLE", stem: "Two similar triangles have corresponding side lengths in ratio 2 : 5. If the area of the larger triangle is 75, what is the area of the smaller triangle?",
      content: { options: [{ id: "a", text: "12" }, { id: "b", text: "18" }, { id: "c", text: "30" }, { id: "d", text: "48" }] },
      key: { correct: ["a"] }, explanation: "Areas scale by the square of the side ratio: (2/5)² = 4/25, so 75 × 4/25 = 12.",
      difficulty: 5, est: 100, taxonomy: S("Math", "Geometry and Trigonometry", "Triangles and similarity"),
      misconceptions: ["Scaling area by the linear ratio (2/5) instead of its square, which gives 30."] },
    { type: "MATCHING", stem: "Match each sine value with its angle.",
      content: { instruction: "Connect each angle on the left with its sine value.", pairs: [
        { id: "a", left: "sin 0°", right: "0" }, { id: "b", left: "sin 30°", right: "1/2" },
        { id: "c", left: "sin 45°", right: "√2/2" }, { id: "d", left: "sin 60°", right: "√3/2" }] },
      key: {}, explanation: "These are the standard exact values: 0, 1/2, √2/2 ≈ 0.707, √3/2 ≈ 0.866.",
      difficulty: 3, est: 90, taxonomy: S("Math", "Geometry and Trigonometry", "Right-triangle trigonometry") },

    // ── Reading & Writing: passage-based ──
    { type: "MCQ_SINGLE", stem: "Which choice best states the main idea of the text?",
      content: { options: [
        { id: "a", text: "Octopuses are less intelligent than researchers expected." },
        { id: "b", text: "The octopus nervous system spreads decision-making beyond the brain, trading precision for flexibility." },
        { id: "c", text: "Centralised nervous systems are superior for building structures." },
        { id: "d", text: "Octopus arms can survive after being separated from the body." }] },
      key: { correct: ["b"] },
      explanation: "The passage develops one claim: most neurons sit in the arms, decisions are delegated locally, and this trades coordination for adaptability — which matches choice B.",
      difficulty: 3, est: 90, taxonomy: S("SAT", "Information and Ideas", "Central ideas and themes"), passage: passageOctopus.id },
    { type: "MCQ_SINGLE", stem: "The author's use of the phrase “each arm taste-tests its world” primarily serves to…",
      content: { options: [
        { id: "a", text: "suggest octopuses use taste rather than sight" },
        { id: "b", text: "vividly illustrate how the arms gather sensory information themselves" },
        { id: "c", text: "imply the arms behave unpredictably" },
        { id: "d", text: "criticise earlier research methods" }] },
      key: { correct: ["b"] },
      explanation: "The figurative phrase makes concrete the point that the arms do their own sensing — a vivid illustration of distributed information gathering.",
      difficulty: 4, est: 90, taxonomy: S("SAT", "Craft and Structure", "Text structure and purpose"), passage: passageOctopus.id },
    { type: "SHORT_ANSWER", stem: "According to the text, approximately what fraction of an octopus's neurons are located in its arms? (Write it as a fraction or in words.)",
      content: {}, key: { accepted: ["two-thirds", "two thirds", "2/3", "2⁄3", "about two-thirds"] },
      explanation: "The opening sentence states that two-thirds of an octopus's neurons live in its arms.",
      difficulty: 3, est: 60, taxonomy: S("SAT", "Information and Ideas", "Command of evidence"), passage: passageOctopus.id },
    { type: "MCQ_SINGLE", stem: "Which choice best describes the narrator's feelings toward the grandmother's kitchen?",
      content: { options: [
        { id: "a", text: "Impatience with its slow rituals" },
        { id: "b", text: "Nostalgic appreciation of its unhurried attention" },
        { id: "c", text: "Fear of being scolded there" },
        { id: "d", text: "Indifference softened by hunger" }] },
      key: { correct: ["b"] },
      explanation: "The narrator recalls urgency having 'a different currency' there and recognises the grandmother's full attention as 'the kitchen's true purpose' — warm, retrospective appreciation.",
      difficulty: 3, est: 90, taxonomy: S("SAT", "Information and Ideas", "Central ideas and themes"), passage: passageKitchen.id },
    { type: "MCQ_SINGLE", stem: "The sentence 'The kettle whistled twice before my grandmother acknowledged it — once for the water, once, she insisted, for her' mainly functions to…",
      content: { options: [
        { id: "a", text: "establish the grandmother's belief that the kitchen had a personal rhythm she answered to" },
        { id: "b", text: "prove the kettle was faulty" },
        { id: "c", text: "show the narrator's irritation" },
        { id: "d", text: "signal that visitors were expected" }] },
      key: { correct: ["a"] },
      explanation: "The personifying detail characterises the grandmother's relationship with the kitchen as a dialogue she chooses to join — a personal rhythm, not a fault.",
      difficulty: 4, est: 95, taxonomy: S("SAT", "Craft and Structure", "Text structure and purpose"), passage: passageKitchen.id },

    // ── Craft & Structure standalone ──
    { type: "MCQ_SINGLE", stem: "Her novel approach to teaching surprised the faculty. As used in this sentence, “novel” most nearly means…",
      content: { options: [{ id: "a", text: "lengthy" }, { id: "b", text: "original" }, { id: "c", text: "fictional" }, { id: "d", text: "recent" }] },
      key: { correct: ["b"] }, explanation: "The context is about surprising a faculty with an approach — 'novel' here means strikingly new or original, not 'fictional'.",
      difficulty: 3, est: 55, taxonomy: S("SAT", "Craft and Structure", "Words in context") },
    { type: "MCQ_MULTI", stem: "Select the two sentences that use the semicolon correctly.",
      content: { options: [
        { id: "a", text: "It rained all morning; we moved the ceremony indoors." },
        { id: "b", text: "Because it rained all morning; we moved the ceremony indoors." },
        { id: "c", text: "The exam was difficult; however, Ana passed on her first attempt." },
        { id: "d", text: "We bought apples; pears; and plums at the market." }] },
      key: { correct: ["a", "c"] },
      explanation: "A semicolon joins two independent clauses (A) or precedes a conjunctive adverb like 'however' (C). In B the first clause is dependent; in D a list needs commas.",
      difficulty: 3, est: 85, taxonomy: S("SAT", "Standard English Conventions", "Punctuation") },
    { type: "MCQ_SINGLE", stem: "A passage first describes a shortage of safe bike lanes, then weighs three proposed fixes and their costs. This organization is best described as…",
      content: { options: [{ id: "a", text: "compare and contrast" }, { id: "b", text: "problem and solution" }, { id: "c", text: "chronological narrative" }, { id: "d", text: "cause and effect" }] },
      key: { correct: ["b"] }, explanation: "A stated problem followed by evaluated remedies is the problem–solution structure.", difficulty: 3, est: 60, taxonomy: S("SAT", "Craft and Structure", "Text structure and purpose") },
    { type: "ORDERING", stem: "Arrange these sentences into the most logical paragraph order.",
      content: { instruction: "First sentence to last.", items: [
        { id: "a", text: "As a result, city councils are rethinking how streets are shared." },
        { id: "b", text: "Cycling has grown fastest where lanes feel safe and continuous." },
        { id: "c", text: "Cities that redesign intersections report measurable gains in ridership." },
        { id: "d", text: "In several countries, more than a quarter of urban trips are now made by bicycle." }] },
      key: { correctOrder: ["d", "b", "a", "c"] },
      explanation: "Broad fact (d) → general condition (b) → consequence (a) → supporting evidence (c).",
      difficulty: 4, est: 110, taxonomy: S("SAT", "Expression of Ideas", "Transitions and cohesion") },

    // ── Expression of Ideas ──
    { type: "MCQ_SINGLE", stem: "The storm knocked out power for three days. ______, the festival continued with acoustic performances. Which transition fits best?",
      content: { options: [{ id: "a", text: "However" }, { id: "b", text: "Consequently" }, { id: "c", text: "Likewise" }, { id: "d", text: "For example" }] },
      key: { correct: ["a"] }, explanation: "The second sentence contrasts expectations (festival continued despite no power), so 'However' is right.",
      difficulty: 3, est: 55, taxonomy: S("SAT", "Expression of Ideas", "Transitions and cohesion") },
    { type: "MCQ_SINGLE", stem: "Which revision is the most concise version of: “Due to the fact that the results were unexpected in nature, the team repeated the experiment again”?",
      content: { options: [
        { id: "a", text: "Because the results were unexpected, the team repeated the experiment." },
        { id: "b", text: "Due to the unexpected results, the team repeated the experiment again." },
        { id: "c", text: "The results being unexpected in nature, the experiment was repeated by the team." },
        { id: "d", text: "Owing to the fact that the results surprised them, the team did the experiment over." }] },
      key: { correct: ["a"] }, explanation: "Choice A removes 'due to the fact that', 'in nature', and 'again' — all redundant — while keeping the meaning and an active voice.",
      difficulty: 3, est: 75, taxonomy: S("SAT", "Expression of Ideas", "Rhetorical synthesis") },

    // ── Standard English Conventions ──
    { type: "MCQ_SINGLE", stem: "The list of names ______ posted on the notice board yesterday.",
      content: { options: [{ id: "a", text: "was" }, { id: "b", text: "were" }, { id: "c", text: "have been" }, { id: "d", text: "are" }] },
      key: { correct: ["a"] }, explanation: "The subject is 'the list' (singular); the prepositional phrase 'of names' does not change the verb.",
      difficulty: 2, est: 45, taxonomy: S("SAT", "Standard English Conventions", "Agreement and pronouns") },
    { type: "MCQ_SINGLE", stem: "Neither the manager nor the clerks had finished ______ quarterly reports.",
      content: { options: [{ id: "a", text: "his or her" }, { id: "b", text: "their" }, { id: "c", text: "its" }, { id: "d", text: "them" }] },
      key: { correct: ["b"] }, explanation: "With 'neither…nor', the pronoun agrees with the nearer subject ('clerks', plural) → 'their'.",
      difficulty: 3, est: 60, taxonomy: S("SAT", "Standard English Conventions", "Agreement and pronouns") },
    { type: "MCQ_SINGLE", stem: "The committee—Aisha, Ben, and Carla—______ reached a decision by noon.",
      content: { options: [{ id: "a", text: "has" }, { id: "b", text: "have" }, { id: "c", text: "having" }, { id: "d", text: "to have" }] },
      key: { correct: ["a"] }, explanation: "'Committee' is a collective singular subject here, and the pair of dashes only interrupts it.",
      difficulty: 3, est: 60, taxonomy: S("SAT", "Standard English Conventions", "Agreement and pronouns") },
    { type: "TRUE_FALSE", stem: "In standard written English, “its” shows possession and “it's” means “it is”.",
      content: {}, key: { correct: true },
      explanation: "The apostrophe in “it's” marks a contraction, not possession — the possessive is “its”.",
      difficulty: 2, est: 35, taxonomy: S("SAT", "Standard English Conventions", "Punctuation") },
    { type: "FILL_BLANK", stem: "Between you and {{1}}, this plan still needs work. The report was written by Farah and {{2}}.",
      content: { blanks: [{ id: "1" }, { id: "2" }] },
      key: { accepted: { "1": ["me"], "2": ["me"] } },
      explanation: "Both blanks follow prepositions ('between', 'by'), which take the objective pronoun 'me'.",
      difficulty: 3, est: 55, taxonomy: S("SAT", "Standard English Conventions", "Agreement and pronouns") },
    { type: "MCQ_MULTI", stem: "Select the two sentences that are fragments (not complete sentences).",
      content: { options: [
        { id: "a", text: "Running through the park at dawn." },
        { id: "b", text: "She runs through the park most mornings." },
        { id: "c", text: "Although he studied all weekend." },
        { id: "d", text: "They left the library before closing time." }] },
      key: { correct: ["a", "c"] },
      explanation: "A lacks a subject/finite verb; C is a subordinate clause with no main clause attached.",
      difficulty: 3, est: 70, taxonomy: S("SAT", "Standard English Conventions", "Agreement and pronouns") },

    // ── Essays ──
    { type: "ESSAY", stem: "Write a short response (4–6 sentences) explaining how the author of “Distributed Minds” supports the claim that an octopus's body plan 'distributes processing to the edge'. Reference at least two specific details from the text.",
      content: { rubric: [{ criterion: "Accurate claim with two text details", points: 4 }, { criterion: "Clear organisation", points: 2 }, { criterion: "Own words (not copied phrasing)", points: 2 }], modelAnswer: "The author supports the claim with the hunting example: the central brain sends only a rough instruction ('go there, investigate') while each arm handles reaching, feeling and gripping locally. The second detail is numerical — two-thirds of the octopus's neurons live in the arms rather than the brain, which makes delegation physically possible. Together these show decision-making being pushed to the body's edge rather than routed through a headquarters." },
      key: {}, explanation: "Compare your response with the model answer and score yourself against the rubric honestly.",
      difficulty: 4, est: 600, taxonomy: S("SAT", "Information and Ideas", "Command of evidence"), passage: passageOctopus.id, points: 8 },
    { type: "ESSAY", stem: "Explain in your own words why dividing by a fraction is equivalent to multiplying by its reciprocal. Include one worked example.",
      content: { rubric: [{ criterion: "Correct explanation of the rule", points: 4 }, { criterion: "Valid worked example", points: 4 }, { criterion: "Clarity for a peer reader", points: 2 }], modelAnswer: "Division asks 'how many of the divisor fit into the dividend'. How many halves fit in 3? Six — which is 3 × 2. In general, 1 ÷ (a/b) = b/a because a/b × b/a = 1. Example: 3 ÷ (1/2) = 3 × 2 = 6, because six halves make three wholes." },
      key: {}, explanation: "Check your explanation covers the 'how many fit' meaning and shows a concrete example.",
      difficulty: 3, est: 480, taxonomy: S("Math", "Advanced Math", "Radicals and rational exponents"), points: 10 },
    { type: "ESSAY", stem: "Reflect on your most frequent error type this month (conceptual, procedural, careless, misread, or time). Describe one concrete habit you will change to reduce it.",
      content: { rubric: [{ criterion: "Names a specific error type with an example", points: 4 }, { criterion: "Proposes a concrete, testable habit", points: 4 }], modelAnswer: "Most of my errors are 'misread' errors: I solve the question I expected instead of the one asked. For the next two weeks I will underline the actual question sentence before answering and re-read it in the final ten seconds before confirming." },
      key: {}, explanation: "Honest reflection works best — specific beats general.",
      difficulty: 4, est: 420, taxonomy: S("Study", "Evidence-based learning", "Error analysis"), points: 8 },

    // ── Study skills ──
    { type: "MATCHING", stem: "Match each study technique with what it involves.",
      content: { instruction: "Connect each technique to its description.", pairs: [
        { id: "a", left: "Retrieval practice", right: "Recalling answers from memory before checking" },
        { id: "b", left: "Spaced repetition", right: "Reviewing at expanding time intervals" },
        { id: "c", left: "Interleaving", right: "Mixing different topics within one session" },
        { id: "d", left: "Elaboration", right: "Explaining the idea in your own words" }] },
      key: {}, explanation: "Each technique strengthens a different part of durable memory — recall, timing, discrimination, and understanding.",
      difficulty: 2, est: 70, taxonomy: S("Study", "Evidence-based learning", "Retrieval practice") },
    { type: "ORDERING", stem: "Order the steps of an effective error-log review workflow.",
      content: { instruction: "First step to last.", items: [
        { id: "a", text: "Attempt the question again without hints" },
        { id: "b", text: "Compare your attempt with the worked solution" },
        { id: "c", text: "Classify the error type and write the root cause" },
        { id: "d", text: "Wait for the scheduled retry interval" },
        { id: "e", text: "Re-attempt the question from memory" }] },
      key: { correctOrder: ["a", "b", "c", "d", "e"] },
      explanation: "Attempt first (honest baseline), then compare, classify, wait for the spacing interval, and finally re-test from memory.",
      difficulty: 2, est: 80, taxonomy: S("Study", "Evidence-based learning", "Error analysis") },
    { type: "TRUE_FALSE", stem: "Re-reading a chapter is generally a more effective study method than testing yourself on it.",
      content: {}, key: { correct: false },
      explanation: "Research on the testing effect consistently shows retrieval practice beats passive re-reading for long-term retention.",
      difficulty: 2, est: 40, taxonomy: S("Study", "Evidence-based learning", "Retrieval practice") },
    { type: "SHORT_ANSWER", stem: "What is the greatest common factor of 24 and 36?",
      content: {}, key: { accepted: ["12", "twelve", "gcd(24,36)=12"] },
      explanation: "24 = 2³·3 and 36 = 2²·3², so the GCF is 2²·3 = 12.",
      difficulty: 2, est: 40, taxonomy: S("Math", "Algebra", "Linear equations") },
    { type: "SHORT_ANSWER", stem: "Name the literary device in: “the wind whispered through the empty streets.”",
      content: {}, key: { accepted: ["personification", "personification."] },
      explanation: "Giving the wind a human action ('whispered') is personification.",
      difficulty: 3, est: 45, taxonomy: S("SAT", "Craft and Structure", "Words in context") },
    { type: "SHORT_ANSWER", stem: "A line is perpendicular to y = 2x + 1. What is its slope? (Write a number or fraction.)",
      content: {}, key: { accepted: ["-1/2", "−1/2", "-0.5", "negative one half"] },
      explanation: "Perpendicular slopes multiply to −1: 2 × m = −1 → m = −1/2.",
      difficulty: 4, est: 55, taxonomy: S("Math", "Algebra", "Linear equations") },

    // Draft / in-review items for the review workflow demo
    { type: "MCQ_SINGLE", stem: "[DRAFT] A train travels 180 km in 2.5 hours. What is its average speed in km/h?",
      content: { options: [{ id: "a", text: "70" }, { id: "b", text: "72" }, { id: "c", text: "75" }, { id: "d", text: "80" }] },
      key: { correct: ["b"] }, explanation: "180 ÷ 2.5 = 72 km/h.", difficulty: 2, est: 45,
      taxonomy: S("Math", "Problem Solving and Data Analysis", "Ratios and percentages"), reviewStatus: "DRAFT" },
    { type: "MCQ_SINGLE", stem: "[NEEDS REVIEW] Which word best completes: “The evidence did not ______ the committee's conclusion”?",
      content: { options: [{ id: "a", text: "substantiate" }, { id: "b", text: "conduct" }, { id: "c", text: "resolve" }, { id: "d", text: "dismiss" }] },
      key: { correct: ["a"] }, explanation: "'Substantiate' means to support with evidence.", difficulty: 3, est: 50,
      taxonomy: S("SAT", "Craft and Structure", "Words in context"), reviewStatus: "IN_REVIEW" },
  ];

  const createdQuestions: { id: string; q: Q }[] = [];
  for (const q of questions) {
    const row = await db.question.create({ data: {
      organizationId: northfield.id,
      type: q.type, stem: q.stem,
      content: JSON.stringify(q.content ?? {}),
      answerKey: JSON.stringify(q.key ?? {}),
      explanation: q.explanation,
      strategies: JSON.stringify(q.strategies ?? {}),
      misconceptions: JSON.stringify(q.misconceptions ?? []),
      difficulty: q.difficulty, estimatedSeconds: q.est,
      taxonomyNodeId: q.taxonomy, passageId: q.passage ?? null,
      tags: JSON.stringify(q.tags ?? []),
      points: q.points ?? 1,
      authorId: teacher.id,
      reviewStatus: q.reviewStatus ?? "APPROVED",
      copyrightNote: "Original content authored for Meridian demo",
    } });
    createdQuestions.push({ id: row.id, q });
  }
  console.log(`  ${createdQuestions.length} questions`);

  // ── Courses ─────────────────────────────────────────────────
  async function mkCourse(title: string, description: string, ownerId: string, est: number) {
    return db.course.create({ data: { organizationId: northfield.id, title, description, ownerId, status: "PUBLISHED", format: "SELF_PACED", estimatedHours: est } });
  }
  const mathCourse = await mkCourse("SAT Mathematics Foundations", "Build a rock-solid base in the four SAT Math domains: algebra, advanced math, data analysis, and geometry with trigonometry. Worked examples, timed drills, and full error tracking.", teacher.id, 24);
  const rwCourse = await mkCourse("SAT Reading & Writing Essentials", "Read actively, spot structure, and master the conventions the SAT actually tests — with annotated passages and immediate feedback on every question.", teacher.id, 18);
  const studyCourse = await mkCourse("Learning How to Learn", "The evidence-based study system: retrieval practice, spaced repetition, interleaving, and error analysis that the rest of your courses plug into.", teacher2.id, 6);

  type LessonSeed = { title: string; content: string; type?: string; durationMin?: number; objectives?: string[] };
  async function mkSection(courseId: string, title: string, summary: string, lessons: LessonSeed[]) {
    const s = await db.courseSection.create({ data: { courseId, title, summary, position: 0 } });
    for (let i = 0; i < lessons.length; i++) {
      const l = lessons[i];
      await db.lesson.create({ data: {
        sectionId: s.id, title: l.title, content: l.content, type: l.type ?? "READING",
        durationMin: l.durationMin ?? 20, objectives: JSON.stringify(l.objectives ?? []), position: i,
      } });
    }
  }

  await mkSection(mathCourse.id, "Algebra basics", "Linear equations, systems, and the habits that prevent sign errors.", [
    { title: "Linear equations: the balance picture", durationMin: 25, objectives: ["Solve one-variable linear equations", "Explain each step using the balance model", "Spot when a step is reversible"],
      content: `## The one idea\n\nAn equation is a **balance scale**. Whatever you do to one pan, you must do to the other — that is the whole theory of equation solving.\n\n### The standard workflow\n\n1. **Clear parentheses** by distributing.\n2. **Collect** the variable terms on one side, constants on the other.\n3. **Combine** like terms.\n4. **Divide** by the coefficient.\n\n### Worked example\n\nSolve \\(2(x + 5) + 3 = 15\\).\n\n- Distribute: \\(2x + 10 + 3 = 15\\)\n- Combine: \\(2x + 13 = 15\\)\n- Subtract 13: \\(2x = 2\\)\n- Divide by 2: \\(x = 1\\)\n\n### The error most students make\n\nMost wrong answers here are **not** algebra errors — they are *copying* errors: a dropped minus sign on the way from one line to the next. Writing one step per line, large and unhurried, removes most of them before they happen.\n\n### Check before you move on\n\nSubstitute your answer into the *original* equation. If both sides match, you are done — no outside authority required.` },
    { title: "Systems of equations: substitution vs. elimination", durationMin: 30, objectives: ["Choose between substitution and elimination", "Solve 2×2 systems exactly"],
      content: `## Two tools, one job\n\nA system asks where two relationships agree. You have two clean tools.\n\n**Substitution** shines when one equation already gives a variable alone: \\(y = x + 5\\) hands you \\(y\\) for free — replace it in the other equation.\n\n**Elimination** shines when coefficients line up: adding \\(3x + y = 11\\) to \\(x - y = 1\\) deletes \\(y\\) in one move.\n\n### Choosing fast\n\n- A variable with coefficient 1? → substitution.\n- Matching or opposite coefficients? → elimination.\n- Neither? Multiply one equation by the smallest number that creates a match, then eliminate.\n\n### Sanity check\n\nInterpret the answer geometrically: two lines meet at one point, run parallel (no solution), or lie on top of each other (infinitely many). If your algebra says something geometry forbids, re-check the algebra.` },
    { title: "Quadratics: three forms, three questions", durationMin: 35, objectives: ["Convert between standard, factored, and vertex form", "Read roots, vertex, and axis of symmetry from each form"],
      content: `## Same parabola, three lenses\n\n| Form | Reads instantly | Question it answers |\n|---|---|---|\n| \\(ax^2+bx+c\\) | \\(c\\) = y-intercept | "What is the value at 0?" |\n| \\(a(x-p)(x-q)\\) | roots \\(p, q\\) | "Where does it cross?" |\n| \\(a(x-h)^2+k\\) | vertex \\((h,k)\\) | "Where is the turning point?" |\n\n### Moving between them\n\n- Factored → standard: **multiply out**.\n- Standard → vertex: **complete the square** (halve \\(b\\), square it, balance).\n- Standard → factored: find roots with the quadratic formula, then write \\(a(x - r_1)(x - r_2)\\).\n\n### The discriminant shortcut\n\n\\(b^2 - 4ac\\) tells you the story before you compute: positive → two roots, zero → one, negative → none. On timed tests, check it *first*.` },
  ]);

  await mkSection(mathCourse.id, "Geometry essentials", "Triangles, circles, and the trig ratios that keep reappearing.", [
    { title: "Right triangles and the Pythagorean triples", durationMin: 20, objectives: ["Recognise 3-4-5, 5-12-13, 6-8-10 families", "Apply the Pythagorean theorem"],
      content: `## Memorise the families, not the formulas\n\nThe theorem is \\(a^2 + b^2 = c^2\\), but speed comes from recognising triples on sight:\n\n- **3-4-5** (and every multiple: 6-8-10, 9-12-15…)\n- **5-12-13**\n- **8-15-17**\n\nA right triangle with legs 6 and 8 is a 3-4-5 in disguise — the hypotenuse is 10 before you finish reading the question.\n\n### The reverse use\n\nGiven the hypotenuse and one leg, subtract squares: \\(b = \\sqrt{c^2 - a^2}\\). Watch for answers that use \\(c^2 + a^2\\) — those are traps set for people who add when they should subtract.` },
    { title: "Similar figures: lengths scale, areas square", durationMin: 25, objectives: ["Use scale factors for lengths and areas", "Avoid the linear-scaling trap for area"],
      content: `## The rule that surprises everyone\n\nIf two similar figures have corresponding lengths in ratio \\(s\\), their **areas** are in ratio \\(s^2\\).\n\nScale factor 2 → lengths double, **areas quadruple**.\n\n### Why\n\nArea is a product of two lengths: \\(\\tfrac{1}{2}bh\\). If both \\(b\\) and \\(h\\) scale by \\(s\\), the product scales by \\(s \\cdot s\\).\n\n### The trap\n\nEvery multiple-choice set about similar triangles includes the linear-scaled answer (e.g. 30 instead of 12). Eliminate it deliberately: *lengths scale, areas square, volumes cube*.` },
  ]);

  await mkSection(mathCourse.id, "Data analysis", "Ratios, percentages, and reading spread from data.", [
    { title: "Percentages: three moves cover everything", durationMin: 20, objectives: ["Translate percent problems into equations", "Compute percent change correctly"],
      content: `## The translation table\n\n| Words | Equation |\n|---|---|\n| "15% of 240" | \\(0.15 \\times 240\\) |\n| "x is 25% of n" | \\(x = 0.25n\\) |\n| "after a 25% discount" | \\(\\text{price} \\times 0.75\\) |\n| "percent change" | \\(\\frac{\\text{new} - \\text{old}}{\\text{old}} \\times 100\\) |\n\n### Two habits\n\n1. **Never compute the discount and forget to subtract it.** The sale price is \\(P(1 - d)\\), not \\(Pd\\).\n2. **Percent change divides by the OLD value.** A price rising from 40 to 50 rose by \\(10/40 = 25\\%\\), not 20%.` },
  ]);

  await mkSection(rwCourse.id, "Reading actively", "How to read a passage once and keep it.", [
    { title: "Read for structure, not details", durationMin: 25, objectives: ["Identify a passage's structural spine", "Predict question types from paragraph roles"],
      content: `## The spine of any passage\n\nAlmost every test passage is built from four moves:\n\n1. **A phenomenon** — something exists and matters.\n2. **A wrinkle** — the obvious explanation is incomplete.\n3. **Evidence** — the part that carries the weight.\n4. **A payoff** — what changes now that we know.\n\nRead looking for the *seams* between these moves. Transitional words ("however", "more recently", "consider") mark them. When you can state the wrinkle in one sentence, main-idea questions answer themselves — the correct choice is the one that restates the wrinkle at the right level of generality.\n\n### What NOT to do\n\nDo not underline everything. If more than a fifth of the passage is marked, nothing is marked.` },
    { title: "Words in context: define by job, not memory", durationMin: 20, objectives: ["Infer word meaning from function in the sentence"],
      content: `## The trap\n\n"Novel" has a dictionary meaning you know (a book). The test uses "novel approach". If you pattern-match to the noun, you lose.\n\n## The method\n\nAsk what **job** the word is doing: "a ____ approach that surprised the faculty". The word must mean *surprising-kind* — **original** fits; "fictional" does not.\n\nSubstitute your own word into the blank *before* looking at the choices, then pick the closest. Your own word is uncontaminated by trap options.` },
  ]);

  await mkSection(rwCourse.id, "Conventions that actually appear", "Agreement, pronouns, and punctuation — the high-youriel rules.", [
    { title: "Agreement: find the true subject", durationMin: 20, objectives: ["Ignore prepositional-phrase decoys", "Apply neither/nor proximity"],
      content: `## Cut the decoy\n\nIn "The list **of names** ___ posted", the subject is *list*, singular. The phrase *of names* is a decoy. Cross out every prepositional phrase before choosing a verb.\n\n## Neither/nor: nearest wins\n\nWith "neither A nor B", match the item **closest** to the verb: "Neither the manager nor the **clerks** … their reports."\n\n## Collective nouns\n\nCommittee, team, jury — usually **singular** in American usage unless the sentence stresses individual members acting separately.` },
  ]);

  await mkSection(studyCourse.id, "The evidence-based toolkit", "Why these methods work and how to run them.", [
    { title: "Retrieval practice: study by testing", durationMin: 15, objectives: ["Explain the testing effect", "Convert re-reading sessions into retrieval sessions"],
      content: `## The finding\n\nDecades of studies converge: **trying to recall something strengthens the memory more than re-exposure**. Re-reading feels productive because it is fluent — fluency is not learning.\n\n## The practice\n\nClose the book. Write everything you remember about the topic. Check. The gaps you find are your real syllabus.\n\n## Where this platform helps\n\nEvery practice session here is retrieval by design. Your mistake log is the record of what retrieval exposed.` },
    { title: "Spaced repetition and your mistake log", durationMin: 15, objectives: ["Explain why expanding intervals beat cramming", "Use retry scheduling deliberately"],
      content: `## Why spacing works\n\nMemories fade on a curve. Reviewing just as recall becomes effortful — not when it is fresh, not when it is gone — produces the strongest consolidation.\n\n## The schedule this platform uses\n\nRetry tomorrow → 3 days → 7 days → 16 days → 35 days. Answer correctly and the interval expands; miss and it resets. Items you mark mastered leave the queue.\n\n## The discipline\n\nA mistake that never gets retried was never actually fixed. Trust the queue, not the feeling of "I've got this now".` },
  ]);

  // ── Assessments ─────────────────────────────────────────────
  const approved = createdQuestions.filter((x) => x.q.reviewStatus === undefined || x.q.reviewStatus === "APPROVED");
  const byStem = (needle: string) => approved.find((x) => x.q.stem.includes(needle))!;
  const byTaxonomy = (node: string | null) => approved.filter((x) => x.q.taxonomy === node);

  async function mkAssessment(cfg: {
    title: string; description: string; type: string; timeLimitMin: number | null;
    courseId: string | null; items: string[]; attemptsAllowed?: number; status?: string;
  }) {
    const a = await db.assessment.create({ data: {
      organizationId: northfield.id, title: cfg.title, description: cfg.description,
      type: cfg.type, status: cfg.status ?? "PUBLISHED", courseId: cfg.courseId,
      timeLimitMin: cfg.timeLimitMin, attemptsAllowed: cfg.attemptsAllowed ?? 2,
      feedbackMode: "AFTER_SUBMIT", passScorePct: 60, createdBy: teacher.id,
    } });
    for (let i = 0; i < cfg.items.length; i++) {
      await db.assessmentItem.create({ data: { assessmentId: a.id, questionId: cfg.items[i], position: i } });
    }
    return a;
  }

  const algebraSkill = S("Math", "Algebra", "Linear equations");
  const diagItems = [
    byStem("3x + 7 = 22").id, byStem("(x + 3)² − (x − 3)²").id, byStem("(2x³)²").id,
    byStem("f(x) = √(3x + 4)").id, byStem("mean of 4, 8, x").id, byStem("shirt priced at $40").id,
    byStem("angles measuring 40° and 65°").id, byStem("sin(θ) = 3/5").id,
    byStem("main idea of the text").id, byStem("taste-tests its world").id,
    byStem("novel approach").id, byStem("list of names").id,
  ];
  const diagnostic = await mkAssessment({
    title: "SAT Diagnostic", description: "A 12-question cross-section of every SAT domain. Your results seed your skill profile and study plan.",
    type: "DIAGNOSTIC", timeLimitMin: 40, courseId: null, items: diagItems, attemptsAllowed: 3,
  });

  const algebraQuizItems = byTaxonomy(algebraSkill).slice(0, 5).map((x) => x.id);
  const algebraQuiz = await mkAssessment({
    title: "Algebra Quiz 1", description: "Linear equations under mild time pressure.",
    type: "QUIZ", timeLimitMin: 15, courseId: mathCourse.id, items: algebraQuizItems,
  });

  const grammarItems = [
    byStem("list of names").id, byStem("Neither the manager nor").id, byStem("committee—Aisha, Ben, and Carla").id,
    byStem("semicolon correctly").id, byStem("fragments (not complete sentences)").id,
  ];
  const grammarQuiz = await mkAssessment({
    title: "Grammar Check", description: "Agreement, pronoun case, and punctuation.",
    type: "QUIZ", timeLimitMin: 12, courseId: rwCourse.id, items: grammarItems,
  });

  const mockItems = diagItems.concat([
    byStem("x² = 4x + 12").id, byStem("fraction of an octopus").id, byStem("narrator's feelings toward the grandmother's kitchen").id,
    byStem("storm knocked out power").id, byStem("strong negative linear relationship").id, byStem("similar triangles have corresponding side lengths").id,
    byStem("greatest common factor of 24 and 36").id, byStem("3ᵃ = 81").id,
  ]);
  await mkAssessment({
    title: "SAT Full Mock 1", description: "20 questions, all domains, full timing. Treat it like test day.",
    type: "MOCK", timeLimitMin: 60, courseId: null, items: mockItems, attemptsAllowed: 2,
  });

  await mkAssessment({
    title: "Geometry Sprint (draft)", description: "Draft — pending question review.",
    type: "PRACTICE_SET", timeLimitMin: null, courseId: mathCourse.id,
    items: [byStem("circle has area 49π").id, byStem("legs of length 6 and 8").id], status: "DRAFT",
  });

  // ── Enrollments ─────────────────────────────────────────────
  for (const [student, course] of [[maya, mathCourse], [maya, rwCourse], [maya, studyCourse], [alex, mathCourse], [alex, rwCourse], [omar, mathCourse], [omar, rwCourse]] as const) {
    await db.enrollment.create({ data: { courseId: course.id, studentId: student.id } });
  }

  // Lesson progress (Maya ~62% of math course, 33% RW, 50% study)
  async function progress(courseId: string, studentId: string, fraction: number) {
    const sections = await db.courseSection.findMany({ where: { courseId }, include: { lessons: true }, orderBy: { position: "asc" } });
    const lessons = sections.flatMap((s) => s.lessons);
    const target = Math.round(lessons.length * fraction);
    const enrollment = await db.enrollment.findUnique({ where: { courseId_studentId: { courseId, studentId } } });
    if (!enrollment) return;
    for (let i = 0; i < target; i++) {
      const days = 1 + Math.floor(rnd() * 20);
      await db.lessonProgress.create({ data: {
        lessonId: lessons[i].id, enrollmentId: enrollment.id, completed: true,
        completedAt: new Date(Date.now() - days * 864e5), timeSpentMin: 10 + Math.floor(rnd() * 25),
      } });
    }
  }
  await progress(mathCourse.id, maya.id, 0.62);
  await progress(rwCourse.id, maya.id, 0.33);
  await progress(studyCourse.id, maya.id, 0.5);
  await progress(mathCourse.id, alex.id, 0.4);
  await progress(rwCourse.id, alex.id, 0.2);
  await progress(mathCourse.id, omar.id, 0.15);

  // ── Historical practice events + skill stats + mistakes ─────
  function correctResponse(q: Q): unknown {
    switch (q.type) {
      case "MCQ_SINGLE": return { type: "MCQ_SINGLE", selected: [((q.key as { correct: string[] }).correct[0])] };
      case "MCQ_MULTI": return { type: "MCQ_MULTI", selected: (q.key as { correct: string[] }).correct };
      case "TRUE_FALSE": return { type: "TRUE_FALSE", selected: (q.key as { correct: boolean }).correct };
      case "SHORT_ANSWER": return { type: "SHORT_ANSWER", text: (q.key as { accepted: string[] }).accepted[0] };
      case "NUMERIC": return { type: "NUMERIC", value: (q.key as { value: number }).value };
      case "ESSAY": return { type: "ESSAY", text: "model", selfAssessment: "CONFIDENT" };
      case "MATCHING": return { type: "MATCHING", mapping: Object.fromEntries((q.content as { pairs: { id: string; right: string }[] }).pairs.map((p) => [p.id, p.right])) };
      case "ORDERING": return { type: "ORDERING", order: (q.key as { correctOrder: string[] }).correctOrder };
      case "FILL_BLANK": return { type: "FILL_BLANK", values: Object.fromEntries(Object.entries((q.key as { accepted: Record<string, string[]> }).accepted).map(([k, v]) => [k, v[0]])) };
      default: return null;
    }
  }
  function wrongResponse(q: Q): unknown {
    const c = correctResponse(q) as { selected?: string[]; selected2?: boolean; text?: string; value?: number; mapping?: Record<string, string>; order?: string[]; values?: Record<string, string> } | null;
    if (!c) return null;
    switch (q.type) {
      case "MCQ_SINGLE": {
        const opts = (q.content as { options: { id: string }[] }).options.map((o) => o.id);
        const wrong = opts.find((o) => o !== (q.key as { correct: string[] }).correct[0])!;
        return { type: "MCQ_SINGLE", selected: [wrong] };
      }
      case "MCQ_MULTI": return { type: "MCQ_MULTI", selected: ((q.key as { correct: string[] }).correct.slice(0, 1)) };
      case "TRUE_FALSE": return { type: "TRUE_FALSE", selected: !(q.key as { correct: boolean }).correct };
      case "SHORT_ANSWER": return { type: "SHORT_ANSWER", text: "no idea" };
      case "NUMERIC": return { type: "NUMERIC", value: (q.key as { value: number }).value + 7 };
      case "ESSAY": return { type: "ESSAY", text: "attempt", selfAssessment: "UNCERTAIN" };
      case "MATCHING": {
        const pairs = (q.content as { pairs: { id: string; right: string }[] }).pairs;
        const shuffled = [...pairs.map((p) => p.right)].reverse();
        return { type: "MATCHING", mapping: Object.fromEntries(pairs.map((p, i) => [p.id, shuffled[i]])) };
      }
      case "ORDERING": return { type: "ORDERING", order: [...((q.key as { correctOrder: string[] }).correctOrder)].reverse() };
      case "FILL_BLANK": return { type: "FILL_BLANK", values: Object.fromEntries(Object.keys((q.key as { accepted: Record<string, string[]> }).accepted).map((k) => [k, "wrong"])) };
      default: return null;
    }
  }

  // Maya: 21 days of practice, accuracy 55% → 82%
  const skillQuestionPools = new Map<string, { id: string; q: Q }[]>();
  for (const x of approved) {
    if (!x.q.taxonomy) continue;
    const list = skillQuestionPools.get(x.q.taxonomy) ?? [];
    list.push(x);
    skillQuestionPools.set(x.q.taxonomy, list);
  }
  const mayaSkillStats = new Map<string, { correct: number; incorrect: number; lastSeen: Date }>();
  const mistakePool: { questionId: string; q: Q; day: number }[] = [];

  for (let day = 21; day >= 1; day--) {
    const when = new Date(Date.now() - day * 864e5 + 16 * 3600e3);
    const accuracy = 0.55 + (21 - day) * (0.27 / 21);
    const n = 3 + Math.floor(rnd() * 5);
    const skills = Array.from(skillQuestionPools.keys());
    for (let i = 0; i < n; i++) {
      const skill = skills[Math.floor(rnd() * skills.length)];
      const pool = skillQuestionPools.get(skill)!;
      const target = pool[Math.floor(rnd() * pool.length)];
      const ok = rnd() < accuracy;
      await db.practiceEvent.create({ data: {
        studentId: maya.id, questionId: target.id, correct: ok,
        seconds: Math.round(target.q.est * (0.7 + rnd() * 0.9)),
        usedAiHelp: !ok && rnd() < 0.25, createdAt: when,
        selfAssessment: target.q.type === "ESSAY" ? (ok ? "CONFIDENT" : "UNCERTAIN") : null,
      } });
      const st = mayaSkillStats.get(skill) ?? { correct: 0, incorrect: 0, lastSeen: when };
      if (ok) st.correct++; else { st.incorrect++; mistakePool.push({ questionId: target.id, q: target.q, day }); }
      st.lastSeen = when;
      mayaSkillStats.set(skill, st);
    }
  }
  // Alex: lighter history
  for (let day = 14; day >= 1; day -= 1) {
    const when = new Date(Date.now() - day * 864e5 + 17 * 3600e3);
    const n = 1 + Math.floor(rnd() * 4);
    const skills = Array.from(skillQuestionPools.keys());
    for (let i = 0; i < n; i++) {
      const skill = skills[Math.floor(rnd() * skills.length)];
      const pool = skillQuestionPools.get(skill)!;
      const target = pool[Math.floor(rnd() * pool.length)];
      const ok = rnd() < 0.45;
      await db.practiceEvent.create({ data: { studentId: alex.id, questionId: target.id, correct: ok, seconds: Math.round(target.q.est * (0.9 + rnd())), createdAt: when } });
    }
  }

  // ── Submitted attempts ──────────────────────────────────────
  async function submitAttempt(assessmentId: string, studentId: string, correctFrac: number, daysAgo: number) {
    const a = await db.assessment.findUnique({ where: { id: assessmentId }, include: { items: { orderBy: { position: "asc" }, include: { question: true } } } });
    if (!a) return null;
    const startedAt = new Date(Date.now() - daysAgo * 864e5 - 40 * 60e3);
    const attempt = await db.attempt.create({ data: {
      assessmentId, studentId, startedAt,
      submittedAt: new Date(startedAt.getTime() + 32 * 60e3),
      status: "SUBMITTED", timeSpentSec: 32 * 60,
    } });
    let score = 0, max = 0;
    const perQuestion: { q: Q; ok: boolean; questionId: string }[] = [];
    for (let i = 0; i < a.items.length; i++) {
      const it = a.items[i];
      const seedQ = createdQuestions.find((x) => x.id === it.questionId)!;
      const ok = rnd() < correctFrac;
      const resp = ok ? correctResponse(seedQ.q) : wrongResponse(seedQ.q);
      const points = it.points ?? seedQ.q.points ?? 1;
      const awarded = ok ? points : seedQ.q.type === "MATCHING" || seedQ.q.type === "FILL_BLANK" ? Math.round(points * 0.25 * 100) / 100 : 0;
      await db.answer.create({ data: {
        attemptId: attempt.id, questionId: it.questionId, sequence: i,
        response: JSON.stringify(resp), isCorrect: seedQ.q.type === "ESSAY" ? null : ok,
        pointsAwarded: awarded, timeSpentSec: Math.round(seedQ.q.est * (0.8 + rnd() * 0.6)),
      } });
      score += awarded; max += points;
      if (seedQ.q.type !== "ESSAY") perQuestion.push({ q: seedQ.q, ok, questionId: it.questionId });
    }
    await db.attempt.update({ where: { id: attempt.id }, data: { score, maxScore: max } });
    await db.gradeEntry.create({ data: {
      organizationId: northfield.id, courseId: a.courseId, studentId,
      assessmentId, itemType: "ASSESSMENT", title: a.title, score, maxScore: max,
      weight: a.type === "MOCK" || a.type === "EXAM" ? 2 : 1,
      category: a.type === "QUIZ" ? "Quizzes" : "Exams", gradedAt: new Date(startedAt.getTime() + 3600e3),
      comment: `${perQuestion.filter((p) => p.ok).length}/${a.items.length} correct`,
    } });
    // skill stats from attempts
    for (const p of perQuestion) {
      if (!p.q.taxonomy) continue;
      const st = mayaSkillStats.get(p.q.taxonomy);
      if (studentId === maya.id && st) { if (p.ok) st.correct++; else st.incorrect++; }
    }
    // mistakes from attempts
    if (studentId === maya.id) {
      for (const p of perQuestion.filter((x) => !x.ok).slice(0, 4)) {
        mistakePool.push({ questionId: p.questionId, q: p.q, day: daysAgo });
      }
    }
    return { score, max };
  }
  await submitAttempt(diagnostic.id, maya.id, 0.58, 18);
  await submitAttempt(algebraQuiz.id, maya.id, 0.85, 9);
  await submitAttempt(grammarQuiz.id, maya.id, 0.7, 5);
  await submitAttempt(diagnostic.id, alex.id, 0.42, 15);
  await submitAttempt(algebraQuiz.id, alex.id, 0.6, 7);
  await submitAttempt(diagnostic.id, omar.id, 0.5, 12);

  // Persist Maya's skill stats
  for (const [nodeId, st] of mayaSkillStats) {
    await db.skillStat.create({ data: {
      studentId: maya.id, taxonomyNodeId: nodeId, correct: st.correct, incorrect: st.incorrect,
      currentStreak: Math.floor(rnd() * 5), lastSeenAt: st.lastSeen,
    } });
  }

  // Mistake log for Maya: newest few OPEN/due, older SCHEDULED, two MASTERED
  const uniqueMistakes = mistakePool.slice(-14);
  let masteredCount = 0;
  for (let i = 0; i < uniqueMistakes.length; i++) {
    const m = uniqueMistakes[i];
    const isMastered = masteredCount < 2 && m.day > 15;
    if (isMastered) masteredCount++;
    const categories = ["INDEPENDENTLY_INCORRECT", "AI_ASSISTED", "CORRECT_SLOW", "CORRECT_UNCERTAIN"];
    const category = isMastered ? "MASTERED_AFTER_REVIEW" : (rnd() < 0.6 ? categories[0] : categories[1 + Math.floor(rnd() * 3)]);
    await db.mistakeEntry.create({ data: {
      studentId: maya.id, questionId: m.questionId, category,
      errorType: pick(["CONCEPTUAL", "PROCEDURAL", "CARELESS", "MISREAD", "TIME"]),
      rootCause: pick([
        "Rushed the setup — wrote the wrong relationship before solving.",
        "Sign error when moving terms across the equals sign.",
        "Knew the method but misremembered the exact trig value.",
        "Solved for the wrong variable — didn't re-read the final question line.",
        "Felt time pressure and guessed instead of eliminating two options first.",
      ]),
      taxonomyNodeId: m.q.taxonomy,
      retryDueAt: new Date(Date.now() + (isMastered ? 20 : (m.day > 10 ? -1 : (3 + Math.floor(rnd() * 8)))) * 864e5),
      reviewCount: isMastered ? 2 : m.day > 10 ? 1 : 0,
      lastReviewedAt: isMastered ? new Date(Date.now() - 3 * 864e5) : null,
      status: isMastered ? "MASTERED" : m.day > 10 ? "SCHEDULED" : "OPEN",
      createdAt: new Date(Date.now() - m.day * 864e5),
    } });
  }

  // ── Assignments ─────────────────────────────────────────────
  const asg1 = await db.assignment.create({ data: {
    courseId: mathCourse.id, title: "Error-log reflection",
    instructions: "Review your five most recent mistakes. For each: classify the error type, write the root cause in one sentence, and schedule the retry. Submit your notes.",
    dueAt: new Date(Date.now() + 4 * 864e5), points: 10, createdBy: teacher.id,
  } });
  const asg2 = await db.assignment.create({ data: {
    courseId: rwCourse.id, title: "Passage annotation",
    instructions: "Annotate 'Distributed Minds': mark the four structural moves (phenomenon, wrinkle, evidence, payoff) and quote the sentence that carries each.",
    dueAt: new Date(Date.now() + 7 * 864e5), points: 15, createdBy: teacher.id,
  } });
  await db.assignmentSubmission.create({ data: {
    assignmentId: asg1.id, studentId: maya.id,
    textSubmission: "1. CARELESS — dropped a minus moving 3x across. Root cause: copying too fast; I'll write one step per line.\n2. MISREAD — solved for y when asked for x. Root cause: skipping the final read; I'll underline the question sentence.\n3. CONCEPTUAL — scaled area linearly for similar triangles. Root cause: never internalised s². Retry scheduled.\n4. TIME — ran out on the discriminant question. Root cause: recomputed instead of checking b²−4ac first.\n5. PROCEDURAL — messed up rationalizing. Root cause: shaky on why multiply by √2/√2.",
    status: "GRADED", grade: 9, feedback: "Excellent specificity — #3's catch about s² is exactly the kind of root cause that transfers. Watch #5: practice three more radicals this week.", gradedBy: teacher.id, gradedAt: new Date(Date.now() - 2 * 864e5),
  } });
  await db.gradeEntry.create({ data: {
    organizationId: northfield.id, courseId: mathCourse.id, studentId: maya.id, assignmentId: asg1.id,
    itemType: "ASSIGNMENT", title: "Error-log reflection", score: 9, maxScore: 10, weight: 1,
    category: "Assignments", gradedBy: teacher.id,
    comment: "Excellent specificity — see feedback.",
  } });
  await db.assignmentSubmission.create({ data: {
    assignmentId: asg1.id, studentId: alex.id,
    textSubmission: "1. CARELESS - arithmetic slip. 2. CONCEPTUAL - didn't know when to use elimination vs substitution. 3. MISREAD.",
    status: "SUBMITTED",
  } });

  // ── Vocabulary ──────────────────────────────────────────────
  const vocab: [string, string, string, string, string, string, string][] = [
    ["mitigate", "B2", "verb", "to make less severe or harmful", "يُخفِّف", "Seat belts mitigate the risk of injury.", "reduce, lessen, alleviate"],
    ["derive", "B2", "verb", "to obtain or infer something from a source", "يستنتج / يشتق", "She derived the formula from first principles.", "obtain, infer, deduce"],
    ["ambiguous", "B2", "adj", "open to more than one interpretation", "غامض", "The ending is deliberately ambiguous.", "unclear, equivocal"],
    ["scrutiny", "C1", "noun", "close and critical examination", "تدقيق / فحص دقيق", "The plan survived public scrutiny.", "examination, inspection"],
    ["advocate", "B2", "verb", "to publicly recommend or support", "يدافع عن / يناصر", "The group advocates safer streets.", "support, champion, endorse"],
    ["profound", "B2", "adj", "very great or intense; showing deep insight", "عميق", "The war had a profound effect on the city.", "deep, far-reaching"],
    ["consolidate", "C1", "verb", "to combine or strengthen into a single whole", "يدمج / يعزز", "The company consolidated its offices.", "merge, strengthen, unify"],
    ["inevitable", "B2", "adj", "certain to happen; unavoidable", "لا مفر منه / حتمي", "Some delay was inevitable.", "unavoidable, certain"],
    ["sufficient", "B1", "adj", "enough for a purpose", "كافٍ", "We have sufficient evidence to proceed.", "enough, adequate"],
    ["rigorous", "C1", "adj", "extremely thorough and careful", "صارم / دقيق", "The study used rigorous methods.", "thorough, exacting, strict"],
    ["articulate", "C1", "verb", "to express clearly in words", "يعبِّر بوضوح", "She articulated the team's concerns well.", "express, enunciate"],
    ["empirical", "C1", "adj", "based on observation or experience, not theory", "تجريبي", "Empirical data supported the hypothesis.", "observed, experimental"],
    ["redundant", "B2", "adj", "no longer needed; unnecessarily repetitive", "زائد عن الحاجة / مكرر", "The second clause is redundant.", "superfluous, needless"],
    ["plausible", "C1", "adj", "seeming reasonable or probable", "معقول / محتمل", "That's a plausible explanation.", "credible, believable"],
    ["substantiate", "C1", "verb", "to provide evidence to support a claim", "يدعم بالأدلة", "The report substantiates the allegations.", "verify, corroborate"],
    ["discern", "C1", "verb", "to perceive or recognise clearly", "يميّز / يتبين", "I could discern a pattern in the errors.", "perceive, detect, distinguish"],
    ["feasible", "B2", "adj", "possible to do easily or conveniently", "قابل للتنفيذ", "Is a 6-week timeline feasible?", "possible, practicable"],
    ["meticulous", "C1", "adj", "showing great attention to detail", "بالغ الدقة", "Her notes are meticulous.", "careful, precise, thorough"],
    ["paradox", "C1", "noun", "a statement that contradicts itself yet may be true", "مفارقة", "It's a paradox that choice can reduce freedom.", "contradiction, puzzle"],
    ["catalyst", "B2", "noun", "something that causes change without being consumed", "محفِّز", "The speech was a catalyst for reform.", "stimulus, trigger"],
    ["criterion", "B2", "noun", "a standard by which something is judged (plural: criteria)", "معيار", "The main criterion is accuracy.", "standard, benchmark"],
    ["ubiquitous", "C1", "adj", "present everywhere", "منتشر في كل مكان", "Smartphones are ubiquitous.", "omnipresent, pervasive"],
    ["resilient", "B2", "adj", "able to recover quickly from difficulties", "مرن / سريع التعافي", "Learners who journal mistakes are more resilient.", "tough, adaptable"],
    ["tentative", "C1", "adj", "not certain or fixed; provisional", "مؤقت / متردد", "We have a tentative plan for July.", "provisional, unconfirmed"],
  ];
  const vocabIds: { id: string }[] = [];
  for (const [word, cefr, pos, def, ar, example, syn] of vocab) {
    const item = await db.vocabItem.create({ data: {
      organizationId: northfield.id, word, cefr, partOfSpeech: pos, definition: def,
      arabicMeaning: ar, example, synonyms: JSON.stringify(syn.split(", ")),
    } });
    vocabIds.push({ id: item.id });
  }
  // Maya's vocab progress: some known, some uncertain, rest unknown & due
  for (let i = 0; i < vocabIds.length; i++) {
    const known = i < 5, uncertain = i >= 5 && i < 10;
    await db.vocabProgress.create({ data: {
      studentId: maya.id, vocabItemId: vocabIds[i].id,
      status: known ? "KNOWN" : uncertain ? "UNCERTAIN" : "UNKNOWN",
      box: known ? 4 + (i % 2) : uncertain ? 2 : 1,
      nextReviewAt: new Date(Date.now() + (known ? (2 + i) * 864e5 : uncertain ? 864e5 * -1 : -864e5)),
      reviewCount: known ? 4 : uncertain ? 2 : 0,
      streak: known ? 4 : uncertain ? 1 : 0,
    } });
  }
  // Alex: fresh queue
  for (const v of vocabIds) {
    await db.vocabProgress.create({ data: { studentId: alex.id, vocabItemId: v.id, nextReviewAt: new Date(Date.now() - 3600e3) } });
  }

  // ── Study plan for Maya ─────────────────────────────────────
  const examDate = new Date(Date.now() + 38 * 864e5);
  const plan = await db.studyPlan.create({ data: {
    studentId: maya.id, goalExam: "SAT", examDate, targetScore: 1350, weeklyHours: 8, active: true,
  } });
  const weakest = ["Triangles and similarity", "Right-triangle trigonometry", "Radicals and rational exponents"];
  const skillByName = (name: string) => Object.values([...rw.domains, ...math.domains]).flatMap((d) => Object.entries(d.skills)).find(([n]) => n === name)?.[1] ?? null;
  for (let d = 0; d < 10; d++) {
    const due = new Date(Date.now() + d * 864e5);
    if (d === 7) {
      await db.studyTask.create({ data: { planId: plan.id, studentId: maya.id, dueDate: due, title: "Full-length SAT mock exam", description: "Timed, uninterrupted, then review every mistake.", type: "MOCK", reason: "Regular full-length practice builds stamina and calibrates readiness.", estimatedMin: 130 } });
      continue;
    }
    if (d === 3 || d === 9) {
      await db.studyTask.create({ data: { planId: plan.id, studentId: maya.id, dueDate: due, title: "Light review: mistake log + vocabulary", description: "Clear everything due, then stop.", type: "REVIEW", reason: "Spaced-repetition items are scheduled today; short sessions keep the streak.", estimatedMin: 40 } });
      continue;
    }
    const skillName = weakest[d % weakest.length];
    const nodeId = skillByName(skillName);
    await db.studyTask.create({ data: {
      planId: plan.id, studentId: maya.id, dueDate: due,
      title: `Practice: ${skillName}`,
      description: "8 adaptive questions targeting this skill.",
      type: "PRACTICE", taxonomyNodeId: nodeId,
      reason: `${skillName} mastery is estimated at ${28 + ((d * 7) % 18)}% — one of your three weakest skills with enough data.`,
      estimatedMin: 45,
    } });
    if (d % 2 === 0) {
      await db.studyTask.create({ data: { planId: plan.id, studentId: maya.id, dueDate: due, title: "Vocabulary flashcards", description: "Words due today.", type: "VOCAB", reason: "Your spaced-repetition queue has cards expiring today.", estimatedMin: 15 } });
    }
  }
  // Mark one past task done
  const firstTask = await db.studyTask.findFirst({ where: { planId: plan.id }, orderBy: { dueDate: "asc" } });
  if (firstTask) {
    await db.studyTask.update({ where: { id: firstTask.id }, data: { status: "DONE", completedAt: new Date(Date.now() - 864e5) } });
  }

  // ── Communication & calendar ────────────────────────────────
  await db.announcement.create({ data: { organizationId: northfield.id, authorId: admin.id, title: "Welcome to the spring term", body: "Question banks are stocked and the diagnostic is open. Start there — it seeds your study plan automatically. Office hours are on the calendar every Tuesday." } });
  await db.announcement.create({ data: { organizationId: northfield.id, courseId: mathCourse.id, authorId: teacher.id, title: "Algebra Quiz 1 is live", body: "Five questions, fifteen minutes. It closes after two attempts, and full explanations unlock after you submit." } });
  await db.announcement.create({ data: { organizationId: northfield.id, courseId: rwCourse.id, authorId: teacher.id, title: "New passage: Distributed Minds", body: "A science passage with main-idea, function-of-phrase, and command-of-evidence questions. Read for structure first." } });

  for (const student of [maya, alex, omar]) {
    await db.notification.create({ data: { userId: student.id, title: "Your diagnostic is ready", body: "Take the 40-minute SAT Diagnostic to seed your skill profile.", view: "assessments" } });
    await db.notification.create({ data: { userId: student.id, title: "Mistakes due for retry", body: "A few questions from your mistake log are scheduled for today.", view: "mistakes" } });
  }
  await db.notification.create({ data: { userId: maya.id, title: "Algebra Quiz 1: 85%", body: "You passed. Review the one systems question you missed.", view: "assessments", read: true } });
  await db.notification.create({ data: { userId: maya.id, title: "Graded: Error-log reflection", body: "You received 9/10. Excellent specificity — see feedback.", view: "grades" } });

  const today9 = new Date(); today9.setHours(9, 0, 0, 0);
  await db.calendarEvent.create({ data: { organizationId: northfield.id, courseId: mathCourse.id, title: "Live session: systems of equations", description: "Bring one system you found hard — we'll solve it three ways.", startAt: new Date(today9.getTime() + 864e5), endAt: new Date(today9.getTime() + 864e5 + 45 * 60e3), type: "CLASS" } });
  await db.calendarEvent.create({ data: { organizationId: northfield.id, courseId: rwCourse.id, title: "Live session: reading for structure", description: "Annotating 'The Second Whistle' together.", startAt: new Date(today9.getTime() + 3 * 864e5), endAt: new Date(today9.getTime() + 3 * 864e5 + 45 * 60e3), type: "CLASS" } });
  await db.calendarEvent.create({ data: { organizationId: northfield.id, title: "Office hours with Ms. Okafor", description: "Drop-in, 20-minute slots. First come, first served.", startAt: new Date(today9.getTime() + 2 * 864e5 + 3600e3), endAt: new Date(today9.getTime() + 2 * 864e5 + 3 * 3600e3), type: "OFFICE_HOUR" } });
  await db.calendarEvent.create({ data: { organizationId: northfield.id, title: "SAT Full Mock 1 window opens", description: "60 minutes, 20 questions. Simulate test conditions.", startAt: new Date(today9.getTime() + 6 * 864e5), endAt: new Date(today9.getTime() + 6 * 864e5 + 2 * 3600e3), type: "EXAM" } });
  await db.calendarEvent.create({ data: { organizationId: northfield.id, courseId: mathCourse.id, title: "Due: Error-log reflection", description: "Assignment deadline.", startAt: new Date(today9.getTime() + 4 * 864e5), endAt: new Date(today9.getTime() + 4 * 864e5 + 3600e3), type: "DEADLINE" } });
  await db.calendarEvent.create({ data: { organizationId: northfield.id, courseId: rwCourse.id, title: "Due: Passage annotation", description: "Assignment deadline.", startAt: new Date(today9.getTime() + 7 * 864e5), endAt: new Date(today9.getTime() + 7 * 864e5 + 3600e3), type: "DEADLINE" } });

  // Discussion posts
  const post1 = await db.discussionPost.create({ data: { courseId: mathCourse.id, authorId: maya.id, title: "Silly question about similar triangles?", body: "I keep scaling area by the side ratio (2/5 instead of 4/25). I *know* the rule — why does my hand still pick the wrong answer under time pressure?" } });
  await db.discussionPost.create({ data: { courseId: mathCourse.id, authorId: teacher.id, parentId: post1.id, body: "Not silly at all — that's exactly the trap the test intends. Two fixes: (1) write 'lengths scale, areas square' at the top of your scratch area; (2) before choosing, ask 'if I double the sides, does the area double or quadruple?' Make the wrong answer feel wrong, not just known-wrong." } });
  await db.discussionPost.create({ data: { courseId: studyCourse.id, authorId: alex.id, title: "Does anyone actually re-attempt old questions?", body: "The mistake log keeps telling me to retry tomorrow. Does waiting a day actually help that much?" } });

  // Audit trail for the seed itself
  await db.auditLog.create({ data: { userId: admin.id, action: "system.seed", entity: "organization", entityId: northfield.id, detail: `Seeded ${createdQuestions.length} questions, 3 courses, 4 assessments` } });

  console.log("Seed complete.");
  console.log("Demo logins (password Demo1234!):");
  console.log("  student@northfield.edu  (Maya — rich history)");
  console.log("  alex@northfield.edu     (Alex — lighter history)");
  console.log("  teacher@northfield.edu  (Sarah)");
  console.log("  admin@northfield.edu    (Priya)");
  console.log("  student@cedar.edu       (Noor — isolated org, Arabic UI)");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
