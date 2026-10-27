// Public landing copy and the demonstration house layout. Everything here is
// illustrative: no figure on the landing page comes from a real measurement.

export const NAV_LINKS = [
  { href: "#recursos", label: "Recursos" },
  { href: "#visualizacao-3d", label: "Plataforma" },
  { href: "#wattstatus-ai", label: "WattStatus AI" },
  { href: "#como-funciona", label: "Como funciona" },
] as const;

export const HERO_HIGHLIGHTS = ["Visualização 3D", "WattStatus AI", "Monitoramento energético", "Planejamento de economia"] as const;

export type DemoRoomId = "living" | "kitchen" | "bedroom" | "bathroom" | "office";

export interface DemoRoom {
  id: DemoRoomId;
  label: string;
  // Furniture generator room type (see floorplan/three/furniture.ts).
  type: string;
  // Footprint in metres: min corner x/z, width (x) and depth (z).
  x: number;
  z: number;
  w: number;
  d: number;
  floor: "wood" | "tile";
  description: string;
}

// Two rows: private rooms at the back, living and kitchen facing the terrace.
export const DEMO_ROOMS: DemoRoom[] = [
  { id: "bedroom", label: "Quarto", type: "bedroom", x: 0, z: 0, w: 4, d: 3.6, floor: "wood", description: "Entenda como hábitos e aparelhos influenciam a energia utilizada neste ambiente." },
  { id: "bathroom", label: "Banheiro", type: "bathroom", x: 4, z: 0, w: 2.3, d: 3.6, floor: "tile", description: "Veja quais equipamentos fazem parte deste ambiente, como o chuveiro elétrico." },
  { id: "office", label: "Escritório", type: "office", x: 6.3, z: 0, w: 3.7, d: 3.6, floor: "wood", description: "Organize computadores e eletrônicos do seu espaço de trabalho." },
  { id: "living", label: "Sala de estar", type: "living", x: 0, z: 3.6, w: 5.6, d: 4.2, floor: "wood", description: "Explore os aparelhos da sala e entenda como eles contribuem para o consumo energético." },
  { id: "kitchen", label: "Cozinha", type: "kitchen", x: 5.6, z: 3.6, w: 4.4, d: 4.2, floor: "tile", description: "Visualize os equipamentos da cozinha e conheça possibilidades de monitoramento." },
];

export const HOUSE_SIZE = { w: 10, d: 7.8 } as const;

export const FEATURES = [
  {
    id: "3d",
    title: "Visualize sua casa em 3D",
    text: "Explore seus ambientes de uma nova perspectiva e visualize os aparelhos associados a cada espaço.",
  },
  {
    id: "costs",
    title: "Entenda seus gastos",
    text: "Acompanhe consumos medidos ou estimados, entenda diferenças e descubra quais aparelhos merecem atenção.",
  },
  {
    id: "ai",
    title: "Converse com o WattStatus AI",
    text: "Faça perguntas sobre seu consumo, investigue mudanças e explore possibilidades de economia com explicações baseadas nos dados disponíveis.",
  },
  {
    id: "plan",
    title: "Planeje sua economia",
    text: "Defina metas, simule mudanças nos hábitos e acompanhe a evolução dos seus planos.",
  },
] as const;

export const STEPS = [
  { title: "Organize sua casa", text: "Cadastre seu imóvel, seus ambientes e aparelhos." },
  { title: "Acompanhe seu consumo", text: "Utilize informações cadastradas e integre dispositivos compatíveis para obter medições quando disponíveis." },
  { title: "Entenda e economize", text: "Explore análises, previsões, simulações e planos de economia." },
] as const;
