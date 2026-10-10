import { Hero } from '../sections/Hero';
import { ServiceGroups } from '../sections/ServiceGroups';
import { Reviews } from '../sections/Reviews';
import { PriceList } from '../sections/PriceList';
import { Skin } from '../sections/Skin';
import { Memberships } from '../sections/Memberships';
import { Visit } from '../sections/Visit';

// Order follows what a visitor needs next: what you offer, proof it's good,
// the signature treatment, every price, ways to save, then how to get here.
// Light and dark sections alternate so each reads as its own chapter.
export function Home() {
  return (
    <>
      <Hero />
      <ServiceGroups />
      <Reviews />
      <Skin />
      <PriceList />
      <Memberships />
      <Visit />
    </>
  );
}
