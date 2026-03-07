"use strict";

const PRICING_TIERS = [
  { key: "base", minFill: 0, maxFill: 0.25, multiplier: 1, label: "Base Price" },
  { key: "warm", minFill: 0.25, maxFill: 0.5, multiplier: 1.2, label: "Rising Demand" },
  { key: "hot", minFill: 0.5, maxFill: 0.75, multiplier: 1.5, label: "Hot Event" },
  { key: "surge", minFill: 0.75, maxFill: 0.9, multiplier: 2, label: "Surge Pricing" },
  { key: "premium", minFill: 0.9, maxFill: 1, multiplier: 3, label: "Premium Last Seats" }
];

function roundMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function getDemandTier(event) {
  const capacity = Math.max(0, Number(event?.capacity || 0));
  const seatsBooked = Math.max(0, Number(event?.seatsBooked || 0));
  const fillRatio = capacity > 0 ? Math.min(1, seatsBooked / capacity) : 0;
  const tier = PRICING_TIERS.find((entry) => fillRatio >= entry.minFill && fillRatio < entry.maxFill)
    || PRICING_TIERS[PRICING_TIERS.length - 1];

  return {
    ...tier,
    fillRatio,
    fillPercent: Math.round(fillRatio * 100)
  };
}

function getDynamicTicketPrice(event, ticket) {
  const basePrice = Math.max(0, Number(ticket?.price || 0));
  const tier = getDemandTier(event);
  return {
    basePrice: roundMoney(basePrice),
    dynamicPrice: roundMoney(basePrice * tier.multiplier),
    pricingTier: tier.key,
    pricingTierLabel: tier.label,
    pricingMultiplier: tier.multiplier,
    fillPercent: tier.fillPercent
  };
}

function decorateTicket(event, ticket) {
  const pricing = getDynamicTicketPrice(event, ticket);
  return {
    ...ticket,
    ...pricing,
    price: pricing.dynamicPrice
  };
}

function decorateEventDynamicPricing(event) {
  if (!event || typeof event !== "object") return event;
  const tier = getDemandTier(event);
  const ticketTypes = Array.isArray(event.ticketTypes) ? event.ticketTypes.map((ticket) => decorateTicket(event, ticket)) : [];
  const lowestTicketPrice = ticketTypes.length
    ? Math.min(...ticketTypes.map((ticket) => Number(ticket.dynamicPrice || ticket.price || 0)))
    : 0;

  return {
    ...event,
    ticketTypes,
    dynamicPricing: {
      tier: tier.key,
      label: tier.label,
      multiplier: tier.multiplier,
      fillPercent: tier.fillPercent
    },
    lowestTicketPrice: roundMoney(lowestTicketPrice)
  };
}

module.exports = {
  getDemandTier,
  getDynamicTicketPrice,
  decorateEventDynamicPricing
};
