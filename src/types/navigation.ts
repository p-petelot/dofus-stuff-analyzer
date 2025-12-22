import type { VNodeChild } from "vue";

export type NavChild = {
  label: string;
  href: string;
  desc?: string;
};

export type NavLink = {
  label: string;
  href: string;
  children?: NavChild[];
};

export type NavBrand = {
  label: string;
  href: string;
  logo?: VNodeChild;
};
