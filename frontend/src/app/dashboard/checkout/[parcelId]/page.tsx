import { Checkout } from "@/components/dashboard/checkout";

export default async function CheckoutPage(props: PageProps<"/dashboard/checkout/[parcelId]">) {
  const { parcelId } = await props.params;
  return <Checkout parcelId={Number(parcelId)} />;
}
