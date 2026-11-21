import { isAuthenticated, isPinEnabled } from '@/lib/auth';
import { getSnapshot } from '@/lib/storage';
import BookkeepingApp from '@/components/BookkeepingApp';
import PinLockScreen from '@/components/PinLockScreen';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const authed = await isAuthenticated();
  if (!authed) {
    return <PinLockScreen />;
  }

  const snapshot = await getSnapshot();

  return (
    <BookkeepingApp
      initialTransactions={snapshot.transactions}
      initialBudget={snapshot.budget}
      storageMode={snapshot.storageMode}
      pinEnabled={isPinEnabled()}
    />
  );
}
