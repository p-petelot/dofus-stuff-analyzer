import type { ReactNode } from "react";

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
  logo?: ReactNode;
};

export type NavCta = {
  label: string;
  href: string;
};
