import PinGate from "@/components/PinGate";

export default function EtfMonitorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PinGate>{children}</PinGate>;
}
