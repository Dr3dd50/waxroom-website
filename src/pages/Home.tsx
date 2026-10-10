import { Hero } from '../sections/Hero';
import { Reviews } from '../sections/Reviews';
import { Menu } from '../sections/Menu';
import { Skin } from '../sections/Skin';
import { Memberships } from '../sections/Memberships';
import { Visit } from '../sections/Visit';

export function Home() {
  return (
    <>
      <Hero />
      <Reviews />
      <Menu />
      <Skin />
      <Memberships />
      <Visit />
    </>
  );
}
