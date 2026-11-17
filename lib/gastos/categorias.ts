import type { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

/** Mismo enum que `expense_category` en la base de datos, en el orden de los mockups. */
export const CATEGORIAS = [
  'home',
  'groceries',
  'eating_out',
  'leisure',
  'transport',
  'subscriptions',
  'health',
  'gifts',
  'other',
] as const;

export type Categoria = (typeof CATEGORIAS)[number];

type Icono = ComponentProps<typeof Ionicons>['name'];

export const INFO_CATEGORIA: Record<Categoria, { nombre: string; icono: Icono }> = {
  home: { nombre: 'Hogar', icono: 'home-outline' },
  groceries: { nombre: 'Súper', icono: 'cart-outline' },
  eating_out: { nombre: 'Comer fuera', icono: 'restaurant-outline' },
  leisure: { nombre: 'Ocio', icono: 'ticket-outline' },
  transport: { nombre: 'Transporte', icono: 'car-outline' },
  subscriptions: { nombre: 'Suscripciones', icono: 'repeat-outline' },
  health: { nombre: 'Salud', icono: 'medkit-outline' },
  gifts: { nombre: 'Regalos', icono: 'gift-outline' },
  other: { nombre: 'Otros', icono: 'ellipsis-horizontal' },
};

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Categorías cuyo nombre contiene el texto buscado («super» encuentra Súper). */
export function categoriasQueCoinciden(texto: string): Categoria[] {
  const t = sinTildes(texto.trim());
  if (!t) return [];
  return CATEGORIAS.filter((c) => sinTildes(INFO_CATEGORIA[c].nombre).includes(t));
}
