import type { RoomLayout } from "@/types/property";

// Ready-made floor plans for the most common Brazilian homes. Sizes follow
// typical market layouts (compact studios, "Minha Casa Minha Vida" 2-bedroom
// flats of 45-55 m², 3-bedroom flats with a suite, single-storey houses with a
// garage and 2-storey "sobrados"), in metres, with rooms side by side.

export interface TemplateRoom {
  name: string;
  type: string;
  layout: RoomLayout;
}

export interface TemplateFloor {
  // Ground floor (0) goes to the floor being viewed; upper floors are created
  // when missing.
  level: number;
  name: string;
  rooms: TemplateRoom[];
}

export interface PlanTemplate {
  id: string;
  name: string;
  description: string;
  kind: "apartment" | "house";
  floors: TemplateFloor[];
}

type Row = [name: string, type: string, x: number, y: number, width: number, depth: number];
const rooms = (rows: Row[]): TemplateRoom[] =>
  rows.map(([name, type, x, y, width, depth]) => ({ name, type, layout: { x, y, width, depth } }));
const ground = (rows: Row[]): TemplateFloor => ({ level: 0, name: "Térreo", rooms: rooms(rows) });

// Every plan follows the same reading order: living areas at the back, a
// hallway across the middle and bedrooms with their bathrooms in front, each
// opening onto the hallway. A suite's bathroom sits beside it, never behind
// the bed.
export const PLAN_TEMPLATES: PlanTemplate[] = [
  {
    id: "studio",
    name: "Studio / kitnet",
    description: "Ambiente integrado, cozinha americana e banheiro. Cerca de 29 m².",
    kind: "apartment",
    floors: [
      ground([
        ["Cozinha", "kitchen", 0, 0, 2.4, 2.5],
        ["Banheiro", "bathroom", 0, 2.5, 2.4, 2],
        ["Quarto e sala", "bedroom", 2.4, 0, 4, 4.5],
      ]),
    ],
  },
  {
    id: "apartment-1",
    name: "Apartamento 1 quarto",
    description: "Sala, cozinha, área de serviço, quarto e banheiro. Cerca de 43 m².",
    kind: "apartment",
    floors: [
      ground([
        ["Sala", "living", 0, 0, 3.6, 3.6],
        ["Cozinha", "kitchen", 3.6, 0, 2.4, 2.4],
        ["Área de serviço", "laundry", 3.6, 2.4, 2.4, 1.2],
        ["Corredor", "hallway", 0, 3.6, 6, 1],
        ["Quarto", "bedroom", 0, 4.6, 3.6, 3],
        ["Banheiro", "bathroom", 3.6, 4.6, 2.4, 2],
      ]),
    ],
  },
  {
    id: "apartment-2",
    name: "Apartamento 2 quartos",
    description: "O mais comum no Brasil: sala, cozinha, serviço, 2 quartos e banheiro. Cerca de 58 m².",
    kind: "apartment",
    floors: [
      ground([
        ["Sala", "living", 0, 0, 4.3, 4],
        ["Cozinha", "kitchen", 4.3, 0, 3.2, 2.6],
        ["Área de serviço", "laundry", 4.3, 2.6, 3.2, 1.4],
        ["Corredor", "hallway", 0, 4, 7.5, 1],
        ["Quarto", "bedroom", 0, 5, 2.9, 3],
        ["Banheiro", "bathroom", 2.9, 5, 1.6, 2.4],
        ["Quarto de casal", "bedroom", 4.5, 5, 3, 3],
      ]),
    ],
  },
  {
    id: "apartment-3-suite",
    name: "Apartamento 3 quartos com suíte",
    description: "Varanda, sala, cozinha, serviço, 2 quartos, suíte e 2 banheiros. Cerca de 90 m².",
    kind: "apartment",
    floors: [
      ground([
        ["Varanda", "balcony", 0, 0, 5, 1.5],
        ["Sala", "living", 0, 1.5, 5, 4],
        ["Cozinha", "kitchen", 5, 0, 3.4, 3.2],
        ["Área de serviço", "laundry", 8.4, 0, 2.4, 3.2],
        ["Banheiro social", "bathroom", 5, 3.2, 1.6, 2.3],
        ["Corredor", "hallway", 0, 5.5, 10.8, 1],
        ["Quarto 1", "bedroom", 0, 6.5, 2.9, 3],
        ["Quarto 2", "bedroom", 2.9, 6.5, 2.9, 3],
        ["Suíte", "suite", 5.8, 6.5, 3.4, 3.2],
        ["Banheiro da suíte", "bathroom", 9.2, 6.5, 1.6, 2.4],
      ]),
    ],
  },
  {
    id: "house-2",
    name: "Casa térrea 2 quartos",
    description: "Garagem, sala, cozinha, serviço, 2 quartos e banheiro. Cerca de 75 m² com a garagem.",
    kind: "house",
    floors: [
      ground([
        ["Garagem", "garage", 0, 0, 3, 5.5],
        ["Sala", "living", 3, 0, 4.2, 4],
        ["Cozinha", "kitchen", 7.2, 0, 3.4, 2.6],
        ["Área de serviço", "laundry", 7.2, 2.6, 3.4, 1.4],
        ["Corredor", "hallway", 3, 4, 7.6, 1],
        ["Quarto", "bedroom", 3, 5, 3, 3],
        ["Banheiro", "bathroom", 6, 5, 1.6, 2.4],
        ["Quarto de casal", "bedroom", 7.6, 5, 3, 3],
      ]),
    ],
  },
  {
    id: "house-3-suite",
    name: "Casa térrea 3 quartos com suíte",
    description: "Garagem, varanda, sala, cozinha, serviço, 2 quartos, suíte e 2 banheiros. Cerca de 115 m² com a garagem.",
    kind: "house",
    floors: [
      ground([
        ["Garagem", "garage", 0, 0, 3.2, 6],
        ["Varanda", "balcony", 3.2, 0, 4.8, 1.5],
        ["Sala", "living", 3.2, 1.5, 4.8, 4],
        ["Cozinha", "kitchen", 8, 0, 3.4, 4],
        ["Área de serviço", "laundry", 11.4, 0, 2, 4],
        ["Banheiro social", "bathroom", 8, 4, 1.6, 1.5],
        ["Corredor", "hallway", 3.2, 5.5, 12.4, 1],
        ["Quarto 1", "bedroom", 3.2, 6.5, 3, 3],
        ["Quarto 2", "bedroom", 6.2, 6.5, 3, 3],
        ["Suíte", "suite", 9.2, 6.5, 3.4, 3.4],
        ["Banheiro da suíte", "bathroom", 12.6, 6.5, 1.8, 2.4],
      ]),
    ],
  },
  {
    id: "sobrado-3",
    name: "Sobrado 3 quartos",
    description: "Térreo com garagem, sala, cozinha e lavabo; em cima suíte, 2 quartos e banheiro. Cerca de 115 m².",
    kind: "house",
    floors: [
      ground([
        ["Garagem", "garage", 0, 0, 3, 5.5],
        ["Sala", "living", 3, 0, 4.5, 4.5],
        ["Cozinha", "kitchen", 7.5, 0, 3, 3],
        ["Área de serviço", "laundry", 7.5, 3, 3, 1.5],
        ["Lavabo", "bathroom", 3, 4.5, 1.5, 1.5],
        ["Quintal", "outdoor", 4.5, 4.5, 6, 2],
      ]),
      {
        level: 1,
        name: "Pavimento superior",
        rooms: rooms([
          ["Corredor", "hallway", 0, 0, 12.6, 1.2],
          ["Quarto 1", "bedroom", 0, 1.2, 3, 3],
          ["Quarto 2", "bedroom", 3, 1.2, 3, 3],
          ["Banheiro", "bathroom", 6, 1.2, 1.6, 2.4],
          ["Suíte", "suite", 7.6, 1.2, 3.4, 3.4],
          ["Banheiro da suíte", "bathroom", 11, 1.2, 1.6, 2.4],
        ]),
      },
    ],
  },
];

export const templateArea = (template: PlanTemplate) =>
  template.floors.reduce((sum, floor) => sum + floor.rooms.reduce((acc, room) => acc + room.layout.width * room.layout.depth, 0), 0);
