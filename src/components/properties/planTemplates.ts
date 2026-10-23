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

// Bedrooms and bathrooms sit along the back wall with a hallway or the
// living room in front of them, so every door opens away from the bed.
export const PLAN_TEMPLATES: PlanTemplate[] = [
  {
    id: "studio",
    name: "Studio / kitnet",
    description: "Ambiente integrado, cozinha americana e banheiro. Cerca de 29 m².",
    kind: "apartment",
    floors: [
      ground([
        ["Quarto e sala", "bedroom", 0, 0, 4, 4.5],
        ["Banheiro", "bathroom", 4, 0, 2.4, 2],
        ["Cozinha", "kitchen", 4, 2, 2.4, 2.5],
      ]),
    ],
  },
  {
    id: "apartment-1",
    name: "Apartamento 1 quarto",
    description: "Quarto, banheiro, sala, cozinha e área de serviço. Cerca de 42 m².",
    kind: "apartment",
    floors: [
      ground([
        ["Quarto", "bedroom", 0, 0, 3.4, 3],
        ["Banheiro", "bathroom", 3.4, 0, 1.7, 2],
        ["Corredor", "hallway", 3.4, 2, 1.7, 1],
        ["Sala", "living", 0, 3, 5.1, 3.6],
        ["Cozinha", "kitchen", 5.1, 3, 2.4, 2.4],
        ["Área de serviço", "laundry", 5.1, 5.4, 2.4, 1.2],
      ]),
    ],
  },
  {
    id: "apartment-2",
    name: "Apartamento 2 quartos",
    description: "O mais comum no Brasil: 2 quartos, banheiro, sala, cozinha e serviço. Cerca de 55 m².",
    kind: "apartment",
    floors: [
      ground([
        ["Quarto", "bedroom", 0, 0, 2.9, 3.2],
        ["Banheiro", "bathroom", 2.9, 0, 1.6, 2],
        ["Corredor", "hallway", 2.9, 2, 1.6, 1.2],
        ["Quarto de casal", "bedroom", 4.5, 0, 3.2, 3.2],
        ["Sala", "living", 0, 3.2, 4.5, 4],
        ["Cozinha", "kitchen", 4.5, 3.2, 3.2, 2.6],
        ["Área de serviço", "laundry", 4.5, 5.8, 3.2, 1.4],
      ]),
    ],
  },
  {
    id: "apartment-3-suite",
    name: "Apartamento 3 quartos com suíte",
    description: "2 quartos, suíte, 2 banheiros, sala, cozinha, serviço e varanda. Cerca de 85 m².",
    kind: "apartment",
    floors: [
      ground([
        ["Quarto 1", "bedroom", 0, 0, 2.9, 3.2],
        ["Quarto 2", "bedroom", 2.9, 0, 2.9, 3.2],
        ["Banheiro social", "bathroom", 5.8, 0, 1.6, 2],
        ["Banheiro da suíte", "bathroom", 7.4, 0, 1.8, 2],
        ["Corredor", "hallway", 5.8, 2, 3.4, 1.2],
        ["Suíte", "suite", 9.2, 0, 3.4, 3.2],
        ["Sala", "living", 0, 3.2, 5.8, 4.2],
        ["Cozinha", "kitchen", 5.8, 3.2, 3, 3],
        ["Área de serviço", "laundry", 8.8, 3.2, 1.8, 3],
        ["Varanda", "balcony", 0, 7.4, 5.8, 1.5],
      ]),
    ],
  },
  {
    id: "house-2",
    name: "Casa térrea 2 quartos",
    description: "Garagem, 2 quartos, banheiro, sala, cozinha e serviço. Cerca de 75 m² com a garagem.",
    kind: "house",
    floors: [
      ground([
        ["Garagem", "garage", 0, 0, 3, 5.5],
        ["Quarto", "bedroom", 3, 0, 3, 3.2],
        ["Banheiro", "bathroom", 6, 0, 1.6, 2],
        ["Corredor", "hallway", 6, 2, 1.6, 1.2],
        ["Quarto de casal", "bedroom", 7.6, 0, 3.2, 3.2],
        ["Sala", "living", 3, 3.2, 4.6, 4],
        ["Cozinha", "kitchen", 7.6, 3.2, 3.2, 2.6],
        ["Área de serviço", "laundry", 7.6, 5.8, 3.2, 1.4],
      ]),
    ],
  },
  {
    id: "house-3-suite",
    name: "Casa térrea 3 quartos com suíte",
    description: "Garagem, 2 quartos, suíte, 2 banheiros, sala, cozinha, serviço e varanda. Cerca de 105 m² com a garagem.",
    kind: "house",
    floors: [
      ground([
        ["Garagem", "garage", 0, 0, 3.2, 6],
        ["Quarto 1", "bedroom", 3.2, 0, 3, 3.2],
        ["Quarto 2", "bedroom", 6.2, 0, 3, 3.2],
        ["Banheiro social", "bathroom", 9.2, 0, 1.6, 2],
        ["Banheiro da suíte", "bathroom", 10.8, 0, 1.8, 2],
        ["Corredor", "hallway", 9.2, 2, 3.4, 1.2],
        ["Suíte", "suite", 12.6, 0, 3.4, 3.2],
        ["Sala", "living", 3.2, 3.2, 5, 4.3],
        ["Cozinha", "kitchen", 8.2, 3.2, 3.5, 3],
        ["Área de serviço", "laundry", 11.7, 3.2, 1.8, 3],
        ["Varanda", "balcony", 3.2, 7.5, 5, 1.5],
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
          ["Suíte", "suite", 0, 0, 3.4, 3.2],
          ["Banheiro da suíte", "bathroom", 3.4, 0, 1.6, 3.2],
          ["Banheiro", "bathroom", 5, 0, 1.6, 3.2],
          ["Quarto 1", "bedroom", 6.6, 0, 3, 3.2],
          ["Quarto 2", "bedroom", 9.6, 0, 3, 3.2],
          ["Corredor", "hallway", 0, 3.2, 12.6, 1.2],
        ]),
      },
    ],
  },
];

export const templateArea = (template: PlanTemplate) =>
  template.floors.reduce((sum, floor) => sum + floor.rooms.reduce((acc, room) => acc + room.layout.width * room.layout.depth, 0), 0);
